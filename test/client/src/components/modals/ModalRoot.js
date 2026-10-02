import { jsx as _jsx } from "react/jsx-runtime";
import { useUi } from '../../store/ui';
import { EmployeePickerDialog } from './EmployeePickerDialog';
import { RoleChangeDialog } from './RoleChangeDialog';
import { LeaveDialog } from './LeaveDialog';
import { AddEmployeeDialog } from './AddEmployeeDialog';
import { ReplaceDialog } from './ReplaceDialog';
import { RemovedListDialog } from './RemovedListDialog';
export function ModalRoot() {
    const dialog = useUi((s) => s.dialog);
    if (dialog.kind === 'none')
        return null;
    switch (dialog.kind) {
        case 'picker':
            return _jsx(EmployeePickerDialog, { dialog: dialog });
        case 'role-change':
            return _jsx(RoleChangeDialog, { dialog: dialog });
        case 'leave':
            return _jsx(LeaveDialog, { dialog: dialog });
        case 'add-employee':
            return _jsx(AddEmployeeDialog, { dialog: dialog });
        case 'replace':
            return _jsx(ReplaceDialog, { dialog: dialog });
        case 'removed-list':
            return _jsx(RemovedListDialog, {});
    }
}
