const User = require('../models/User');
const Role = require('../models/Role');
const Permission = require('../models/Permission');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_EMAIL = 'admin@retailos.local';

async function seedSuperAdmin() {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      return { skipped: true, message: 'Users already exist' };
    }
    let perm = await Permission.findOne({ code: 'admin.all' });
    if (!perm) {
      perm = await Permission.create({
        name: 'Full Admin',
        code: 'admin.all',
        module: 'admin',
        description: 'Full system access'
      });
    }
    const role = await Role.create({
      name: 'Super Admin',
      code: 'super_admin',
      description: 'Administrator with full access',
      permissions: [perm._id]
    });
    await User.create({
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      roles: [role._id],
      groups: [],
      isActive: true
    });
    return { skipped: false, username: ADMIN_USERNAME, password: ADMIN_PASSWORD };
  } catch (error) {
    console.error('Seed error:', error.message);
    throw error;
  }
}

module.exports = { seedSuperAdmin, ADMIN_USERNAME, ADMIN_PASSWORD };
