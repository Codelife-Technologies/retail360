import React from 'react';
import Users from '../components/Users';
import Roles from '../components/Roles';
import Permissions from '../components/Permissions';
import Groups from '../components/Groups';
import ActivityLogs from '../components/ActivityLogs';
import './UserManagementModule.css';

function UserManagementModule({ subTab = 'users', onNavigateSubTab }) {
  const openRoles = () => {
    if (typeof onNavigateSubTab === 'function') onNavigateSubTab('roles');
  };

  const renderPanel = () => {
    switch (subTab) {
      case 'users':
        return <Users onOpenRoles={openRoles} />;
      case 'roles':
        return <Roles />;
      case 'permissions':
        return <Permissions />;
      case 'groups':
        return <Groups />;
      case 'logs':
        return <ActivityLogs />;
      default:
        return <Users onOpenRoles={openRoles} />;
    }
  };

  return <div className="user-management-module">{renderPanel()}</div>;
}

export default UserManagementModule;
