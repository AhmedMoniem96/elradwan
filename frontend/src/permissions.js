export const ROLE_CAPABILITY_MATRIX = {
  cashier: [
    'sales.dashboard.view',
    'sales.pos.access',
    'sales.customers.view',
    'inventory.view',
    'sync.view',
    'device.read',
    'shift.close.self',
  ],
  supervisor: [
    'sales.dashboard.view',
    'sales.pos.access',
    'sales.customers.view',
    'inventory.view',
    'sync.view',
    'device.read',
    'shift.close.self',
    'shift.close.override',
    'invoice.void',
    'stock.adjust',
    'stock.transfer.approve',
    'stock.transfer.complete',
    'supplier.payment.create',
    'supplier.payment.approve',
  ],
  admin: [
    'sales.dashboard.view',
    'sales.pos.access',
    'sales.customers.view',
    'inventory.view',
    'sync.view',
    'device.read',
    'device.manage',
    'user.manage',
    'admin.records.manage',
    'shift.close.self',
    'shift.close.override',
    'invoice.void',
    'stock.adjust',
    'stock.transfer.approve',
    'stock.transfer.complete',
    'supplier.payment.create',
    'supplier.payment.approve',
  ],
};

export const hasCapability = (user, capability) => {
  if (!user) return false;
  if (user.is_superuser) return true;
  const role = user.role || 'cashier';
  return (ROLE_CAPABILITY_MATRIX[role] || []).includes(capability);
};
