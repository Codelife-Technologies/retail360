import React from 'react';
import Users from '../components/Users';
import Roles from '../components/Roles';
import Permissions from '../components/Permissions';
import Groups from '../components/Groups';
import ActivityLogs from '../components/ActivityLogs';
import './UserManagementModule.css';

function UserManagementModule({ subTab = 'users' }) {
  const renderPanel = () => {
    switch (subTab) {
      case 'users':
        return <Users />;
      case 'roles':
        return <Roles />;
      case 'permissions':
        return <Permissions />;
      case 'groups':
        return <Groups />;
      case 'logs':
        return <ActivityLogs />;
      default:
        return <Users />;
    }
  };

  return <div className="user-management-module">{renderPanel()}</div>;
}

export default UserManagementModule;
