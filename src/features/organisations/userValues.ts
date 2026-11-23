import type { UserData } from "@/application/organisations/userData";
import type { CardValues } from "./parts";

export interface UserValues extends CardValues {
  description: string;
  status: string;
}

export const toValues = (data: UserData): UserValues => ({
  name: data.card.name,
  email: data.card.email,
  voice: data.card.voice,
  description: data.description,
  status: data.status,
});

export const toData = (values: Partial<UserValues>): UserData => ({
  card: { name: values.name ?? "", email: values.email ?? "", voice: values.voice ?? "" },
  description: values.description ?? "",
  status: values.status ?? "",
});
