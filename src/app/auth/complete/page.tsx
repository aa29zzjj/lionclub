import { redirect } from "next/navigation";

export default function CompleteFederatedProfile() {
  redirect("/register?federated=1");
}
