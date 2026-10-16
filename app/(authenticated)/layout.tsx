export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isFeedbackEnabled } from "@/app/constants/feedback";
import { isStripeEnabled } from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import { isCertificateEligible } from "@/app/lib/certificate";
import {
  checkAdminPermissions,
  checkInstructorPermissions,
  isLearnerRole,
} from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { SideNav } from "./components/SideNav";
import { TrialBanner } from "./components/TrialBanner";
import { UnreadAnnouncementBadge } from "./components/UnreadAnnouncementBadge";

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userStatus, userRole } = await getServerAuth();

  // proxy.ts is the first line of defense, but allow only active/trial here too in case of proxy
  // skip paths or misconfiguration (allowlist two-layer defense). getServerAuth() is memoized with
  // React.cache(), so this adds no DB access.
  if (userStatus !== USER_STATUS.ACTIVE && userStatus !== USER_STATUS.TRIAL) {
    if (userStatus === USER_STATUS.REJECTED) {
      redirect("/rejected");
    }
    redirect("/login");
  }

  const isAdmin = checkAdminPermissions(userRole);
  const isInstructor = checkInstructorPermissions(userRole);
  const stripeEnabled = isStripeEnabled();
  const feedbackEnabled = isFeedbackEnabled();

  return (
    <div className="sm:flex min-h-screen">
      <SideNav
        isAdmin={isAdmin}
        isInstructor={isInstructor}
        stripeEnabled={stripeEnabled}
        feedbackEnabled={feedbackEnabled}
        showCertificates={isCertificateEligible(userStatus, userRole)}
        showReviewList={isLearnerRole(userRole)}
        announcementBadge={
          // The unread query runs behind Suspense so the shell (and each route's loading.tsx)
          // renders without waiting on it. The userStatus gate above still runs first.
          <Suspense fallback={null}>
            <UnreadAnnouncementBadge />
          </Suspense>
        }
      />
      <main className="flex-1 sm:ml-64 p-6 pt-20 sm:pt-6 print:ml-0 print:p-0">
        {userStatus === USER_STATUS.TRIAL && <TrialBanner stripeEnabled={stripeEnabled} />}
        {children}
      </main>
    </div>
  );
}
