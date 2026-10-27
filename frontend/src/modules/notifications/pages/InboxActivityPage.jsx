import ModulePage from "../../../components/common/ModulePage";
import NotificationsPage from "./NotificationsPage";
import AuditPage from "../../audit/pages/AuditPage";

function InboxActivityPage() {
  return (
    <ModulePage
      title="Inbox & activity"
      description="Messages, notifications, and the audit trail for your account scope."
    >
      <NotificationsPage embedded />
      <AuditPage embedded />
    </ModulePage>
  );
}

export default InboxActivityPage;
