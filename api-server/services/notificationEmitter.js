let ioEmitter = null;

export function setNotificationEmitter(io) {
  ioEmitter = io || null;
}

export function emitNotificationEvent(rooms = [], payload = {}) {
  if (!ioEmitter || !Array.isArray(rooms) || rooms.length === 0) return;
  const uniqueRooms = Array.from(new Set(rooms.filter(Boolean)));
  if (!uniqueRooms.length) return;
  uniqueRooms.forEach((room) => {
    ioEmitter.to(room).emit('notification:new', payload);
  });
}

export function emitNotificationToEmpIds(empIds = [], payload = {}) {
  if (!Array.isArray(empIds) || empIds.length === 0) return;
  const rooms = empIds
    .map((empId) => {
      if (empId === undefined || empId === null) return null;
      const normalized = String(empId).trim();
      return normalized ? `emp:${normalized}` : null;
    })
    .filter(Boolean);
  emitNotificationEvent(rooms, payload);
}
