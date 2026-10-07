import type { Metadata } from "next";
import { UserProfileScreen } from "../../components/user-profile-screen";

export const metadata: Metadata = {
  title: "User Profile & Settings",
  description: "Edit your account profile, contact number, clinic address, and change password.",
};

export default function UserPage() {
  return <UserProfileScreen />;
}
