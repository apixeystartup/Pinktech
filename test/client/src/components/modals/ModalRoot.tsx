import { useUi } from '../../store/ui';
import { EmployeePickerDialog } from './EmployeePickerDialog';
import { RoleChangeDialog } from './RoleChangeDialog';
import { LeaveDialog } from './LeaveDialog';
import { AddEmployeeDialog } from './AddEmployeeDialog';
import { ReplaceDialog } from './ReplaceDialog';
import { EditEmployeeEmailDialog } from './EditEmployeeEmailDialog';
import { RemovedListDialog } from './RemovedListDialog';

export function ModalRoot() {
  const dialog = useUi((s) => s.dialog);
  if (dialog.kind === 'none') return null;
  switch (dialog.kind) {
    case 'picker':
      return <EmployeePickerDialog dialog={dialog} />;
    case 'role-change':
      return <RoleChangeDialog dialog={dialog} />;
    case 'leave':
      return <LeaveDialog dialog={dialog} />;
    case 'add-employee':
      return <AddEmployeeDialog dialog={dialog} />;
    case 'replace':
      return <ReplaceDialog dialog={dialog} />;
    case 'edit-employee-email':
      return <EditEmployeeEmailDialog dialog={dialog} />;
    case 'removed-list':
      return <RemovedListDialog />;
  }
}
