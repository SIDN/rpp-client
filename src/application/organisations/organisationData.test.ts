import { describe, expect, it } from "vitest";
import type { Organisation } from "@/rpp/core/types/objects";
import { RppError } from "@/rpp/errors/RppError";
import {
  buildOrganisationPatch,
  cleanOrganisation,
  createBody,
  describeOrganisationOperation,
  EMPTY_ORGANISATION,
  organisationEditOf,
  parseOrganisationId,
  userLinksOf,
  type OrganisationData,
} from "./organisationData";

const ORGANISATION = {
  "@type": "organisation",
  id: "ORG-1",
  provMetadata: { "@type": "provMetadata", spClientId: "REG-1" },
  status: [
    { "@type": "organisationStatus", label: "ok" },
    { "@type": "organisationStatus", label: "clientUpdateProhibited" },
    { "@type": "organisationStatus", label: "serverUpdateProhibited" },
  ],
  roles: {
    registrar: { "@type": "organisationRole", roleId: "1234", status: [{ "@type": "organisationRoleStatus", label: "linked" }] },
    reseller: { "@type": "organisationRole" },
  },
  parent: { "@type": "organisation", id: "ORG-0" },
  contactInfo: { "@type": "Card", version: "2.0", name: { full: "Example Registrar" }, emails: { email: { address: "info@example.test" } } },
  contacts: [{ label: "admin", object: { "@type": "contact", id: "C-1" } }],
  users: [{ label: "admin", object: { "@type": "user", id: "U-1" } }],
} as unknown as Organisation;

const edit = (overrides: Partial<OrganisationData> = {}): OrganisationData => ({ ...organisationEditOf(ORGANISATION), ...overrides });

describe("organisation identifier", () => {
  it("loses its surrounding whitespace and must not be empty", () => {
    expect(parseOrganisationId(" ORG-1 ")).toBe("ORG-1");
    expect(() => parseOrganisationId(" ")).toThrow(RppError);
  });
});

describe("organisationEditOf", () => {
  it("reads the roles, the parent, the Card, the contacts and the statuses a client may set", () => {
    expect(organisationEditOf(ORGANISATION)).toEqual({
      roles: [
        { name: "registrar", roleId: "1234", linkProhibited: false },
        { name: "reseller", roleId: "", linkProhibited: false },
      ],
      parent: "ORG-0",
      card: { name: "Example Registrar", email: "info@example.test", voice: "" },
      contacts: [{ label: "admin", id: "C-1" }],
      clientStatuses: ["clientUpdateProhibited"],
    });
  });
});

describe("cleanOrganisation", () => {
  const role = { name: "registrar", roleId: "", linkProhibited: false };

  it("needs at least one role, and drops rows left empty", () => {
    expect(() => cleanOrganisation(EMPTY_ORGANISATION)).toThrow("at least one role");
    const cleaned = cleanOrganisation({ ...EMPTY_ORGANISATION, roles: [role, { name: " ", roleId: "", linkProhibited: false }], contacts: [{ label: " ", id: "" }] });
    expect(cleaned.roles).toEqual([role]);
    expect(cleaned.contacts).toEqual([]);
  });

  it("refuses a role without a type, a role given twice and a contact that is not whole", () => {
    expect(() => cleanOrganisation({ ...EMPTY_ORGANISATION, roles: [{ name: "", roleId: "1", linkProhibited: false }] })).toThrow("every role a type");
    expect(() => cleanOrganisation({ ...EMPTY_ORGANISATION, roles: [role, { ...role }] })).toThrow("given twice");
    expect(() => cleanOrganisation({ ...EMPTY_ORGANISATION, roles: [role], contacts: [{ label: "admin", id: "" }] })).toThrow("an identifier");
    expect(() => cleanOrganisation({ ...EMPTY_ORGANISATION, roles: [role], contacts: [{ label: "", id: "C-1" }] })).toThrow("a type");
  });
});

describe("createBody", () => {
  it("sends the identifier, the roles and only what else was filled in", () => {
    expect(createBody({ id: " ORG-2 ", data: { ...EMPTY_ORGANISATION, roles: [{ name: "reseller", roleId: "", linkProhibited: false }] } })).toEqual({
      "@type": "organisation",
      id: "ORG-2",
      roles: { reseller: { "@type": "organisationRole" } },
    });
  });

  it("sends the role identifier and lock, the parent, the Card, the contacts and the statuses", () => {
    const body = createBody({
      id: "ORG-2",
      data: {
        roles: [{ name: "registrar", roleId: "1234", linkProhibited: true }],
        parent: " ORG-0 ",
        card: { name: "Example", email: "info@example.test", voice: "" },
        contacts: [{ label: "tech", id: "C-9" }],
        clientStatuses: ["clientDeleteProhibited"],
      },
    });
    expect(body).toEqual({
      "@type": "organisation",
      id: "ORG-2",
      status: [{ "@type": "organisationStatus", label: "clientDeleteProhibited" }],
      roles: { registrar: { "@type": "organisationRole", roleId: "1234", status: [{ "@type": "organisationRoleStatus", label: "clientLinkProhibited" }] } },
      parent: { "@type": "organisation", id: "ORG-0" },
      contactInfo: { "@type": "Card", version: "2.0", name: { full: "Example" }, emails: { email: { address: "info@example.test" } } },
      contacts: [{ label: "tech", object: { "@type": "contact", id: "C-9" } }],
    });
  });

  it("is refused without an identifier or a role", () => {
    expect(() => createBody({ id: "", data: { ...EMPTY_ORGANISATION, roles: [{ name: "registrar", roleId: "", linkProhibited: false }] } })).toThrow(RppError);
    expect(() => createBody({ id: "ORG-2", data: EMPTY_ORGANISATION })).toThrow(RppError);
  });
});

describe("buildOrganisationPatch", () => {
  it("has no operations when nothing changed", () => {
    expect(buildOrganisationPatch(ORGANISATION, edit())).toEqual([]);
  });

  it("adds, removes and changes roles, escaping what a JSON Pointer would misread", () => {
    const patch = buildOrganisationPatch(
      ORGANISATION,
      edit({
        roles: [
          { name: "registrar", roleId: "5678", linkProhibited: true },
          { name: "dns/operator", roleId: "", linkProhibited: false },
        ],
      }),
    );
    expect(patch).toEqual([
      { op: "remove", path: "/roles/reseller" },
      { op: "replace", path: "/roles/registrar/roleId", value: "5678" },
      { op: "add", path: "/roles/registrar/status", value: { "@type": "organisationRoleStatus", label: "clientLinkProhibited" } },
      { op: "add", path: "/roles/dns~1operator", value: { "@type": "organisationRole" } },
    ]);
  });

  it("adds a role identifier, removes one, and allows linking again", () => {
    const locked = {
      ...ORGANISATION,
      roles: { registrar: { "@type": "organisationRole", status: [{ "@type": "organisationRoleStatus", label: "clientLinkProhibited" }] }, reseller: { "@type": "organisationRole", roleId: "9" } },
    } as unknown as Organisation;
    expect(
      buildOrganisationPatch(locked, {
        ...organisationEditOf(locked),
        roles: [
          { name: "registrar", roleId: "1", linkProhibited: false },
          { name: "reseller", roleId: "", linkProhibited: false },
        ],
      }),
    ).toEqual([
      { op: "add", path: "/roles/registrar/roleId", value: "1" },
      { op: "remove", path: "/roles/registrar/status", match: { label: "clientLinkProhibited" } },
      { op: "remove", path: "/roles/reseller/roleId" },
    ]);
  });

  it("starts the status of a role as a list when it has none", () => {
    expect(
      buildOrganisationPatch(ORGANISATION, edit({ roles: [{ name: "registrar", roleId: "1234", linkProhibited: false }, { name: "reseller", roleId: "", linkProhibited: true }] })),
    ).toEqual([{ op: "add", path: "/roles/reseller/status", value: [{ "@type": "organisationRoleStatus", label: "clientLinkProhibited" }] }]);
  });

  it("sets, changes and removes the parent", () => {
    expect(buildOrganisationPatch(ORGANISATION, edit({ parent: "ORG-5" }))).toEqual([{ op: "replace", path: "/parent/id", value: "ORG-5" }]);
    expect(buildOrganisationPatch(ORGANISATION, edit({ parent: "" }))).toEqual([{ op: "remove", path: "/parent" }]);
    const orphan = { ...ORGANISATION, parent: undefined } as Organisation;
    expect(buildOrganisationPatch(orphan, { ...organisationEditOf(orphan), parent: "ORG-5" })).toEqual([{ op: "add", path: "/parent", value: { "@type": "organisation", id: "ORG-5" } }]);
  });

  it("changes the Card below contactInfo, or adds it whole when there is none", () => {
    expect(buildOrganisationPatch(ORGANISATION, edit({ card: { name: "New name", email: "info@example.test", voice: "" } }))).toEqual([
      { op: "replace", path: "/contactInfo/name/full", value: "New name" },
    ]);
    const bare = { ...ORGANISATION, contactInfo: undefined } as Organisation;
    expect(buildOrganisationPatch(bare, { ...organisationEditOf(bare), card: { name: "Name", email: "", voice: "" } })).toEqual([
      { op: "add", path: "/contactInfo", value: { "@type": "Card", version: "2.0", name: { full: "Name" } } },
    ]);
    expect(buildOrganisationPatch(bare, organisationEditOf(bare))).toEqual([]);
  });

  it("adds and removes contacts, and a changed identifier is a removal and an addition", () => {
    expect(buildOrganisationPatch(ORGANISATION, edit({ contacts: [{ label: "admin", id: "C-1" }, { label: "tech", id: "C-2" }] }))).toEqual([
      { op: "add", path: "/contacts", value: { label: "tech", object: { "@type": "contact", id: "C-2" } } },
    ]);
    expect(buildOrganisationPatch(ORGANISATION, edit({ contacts: [{ label: "admin", id: "C-3" }] }))).toEqual([
      { op: "remove", path: "/contacts", match: { label: "admin", object: { id: "C-1" } } },
      { op: "add", path: "/contacts", value: { label: "admin", object: { "@type": "contact", id: "C-3" } } },
    ]);
  });

  it("adds contacts as a list when the organisation has none", () => {
    const none = { ...ORGANISATION, contacts: undefined } as Organisation;
    expect(buildOrganisationPatch(none, { ...organisationEditOf(none), contacts: [{ label: "admin", id: "C-1" }, { label: "tech", id: "C-2" }] })).toEqual([
      {
        op: "add",
        path: "/contacts",
        value: [
          { label: "admin", object: { "@type": "contact", id: "C-1" } },
          { label: "tech", object: { "@type": "contact", id: "C-2" } },
        ],
      },
    ]);
  });

  it("changes only the statuses a client may set", () => {
    expect(buildOrganisationPatch(ORGANISATION, edit({ clientStatuses: ["clientDeleteProhibited"] }))).toEqual([
      { op: "remove", path: "/status", match: { label: "clientUpdateProhibited" } },
      { op: "add", path: "/status", value: { "@type": "organisationStatus", label: "clientDeleteProhibited" } },
    ]);
  });

  it("does not touch the users", () => {
    expect(buildOrganisationPatch(ORGANISATION, edit()).some((operation) => operation.path.startsWith("/users"))).toBe(false);
  });

  it("refuses an edit the draft does not allow", () => {
    expect(() => buildOrganisationPatch(ORGANISATION, edit({ roles: [] }))).toThrow(RppError);
  });
});

describe("userLinksOf", () => {
  it("lists the users the organisation lists, then those seen that it does not, each once", () => {
    const listed = {
      ...ORGANISATION,
      users: [
        { label: "admin", object: { "@type": "user", id: "U-1" } },
        { label: "tech", object: { "@type": "user", id: "U-1" } },
        { label: "tech", object: { "@type": "user", id: "U-2" } },
        { label: "x", object: {} },
      ],
    } as unknown as Organisation;
    expect(userLinksOf(listed, ["U-3", "U-2", ""])).toEqual([
      { id: "U-1", label: "admin" },
      { id: "U-2", label: "tech" },
      { id: "U-3", label: "" },
    ]);
  });

  it("knows the users seen when the organisation is not known", () => {
    expect(userLinksOf(undefined, ["U-3"])).toEqual([{ id: "U-3", label: "" }]);
    expect(userLinksOf(undefined)).toEqual([]);
  });
});

describe("describeOrganisationOperation", () => {
  it("says in words what an operation does", () => {
    const line = (organisationPatch: ReturnType<typeof buildOrganisationPatch>) => organisationPatch.map(describeOrganisationOperation);
    expect(
      line(buildOrganisationPatch(ORGANISATION, edit({ roles: [{ name: "registrar", roleId: "5", linkProhibited: true }, { name: "dns/operator", roleId: "", linkProhibited: false }], parent: "", contacts: [], clientStatuses: [] }))),
    ).toEqual([
      "Remove the role reseller",
      "Change the role identifier of registrar",
      "Prohibit linking to the role registrar",
      "Add the role dns/operator",
      "Remove the parent organisation",
      "Remove the admin contact C-1",
      "Remove status clientUpdateProhibited",
    ]);
    expect(line(buildOrganisationPatch(ORGANISATION, edit({ parent: "ORG-5", card: { name: "", email: "x@example.test", voice: "+31.2" }, clientStatuses: ["clientUpdateProhibited", "clientDeleteProhibited"] })))).toEqual([
      "Set the parent organisation to ORG-5",
      "Remove the name",
      "Change the email address",
      "Add the phone number",
      "Add status clientDeleteProhibited",
    ]);
  });
});
