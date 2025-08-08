import { Server } from 'socket.io';
import { initializeDatabase } from '../../lib/db';
import { processes, killProcess } from '../../lib/processes';

// This API route is responsible for setting up the Socket.IO server.
// It will be called by the client to establish the connection.
export default function socketHandler(req, res) {
  // If the socket server is already running, we're done.
  if (res.socket.server.io) {
    console.log('Socket is already running');
    res.end();
    return;
  }

  console.log('Socket is initializing');
  const io = new Server(res.socket.server);
  res.socket.server.io = io;

  // Cleanup function to kill all running processes
  const cleanup = () => {
    console.log('Cleaning up running processes...');
    Object.keys(processes).forEach(commandId => {
      killProcess(commandId);
    });
  };

  // Handle server shutdown
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('create_command', async (data) => {
      const db = await initializeDatabase();
      const command_id = data.id || `cmd-${Date.now()}`;
      data.id = command_id;
      await db.run(`INSERT INTO commands (id, data) VALUES (?, ?)`, [command_id, JSON.stringify(data)]);
      io.emit('command_added', data);
    });

    socket.on('delete_command', async (data) => {
      const db = await initializeDatabase();
      const { id } = data;
      if (id) {
        await db.run(`DELETE FROM commands WHERE id = ?`, id);
        await db.run(`DELETE FROM argument_history WHERE command_id = ?`, id);
        delete processes[id];
        io.emit('command_deleted', { command_id: id });
      }
    });

    socket.on('disconnect', () => {
      console.log('user disconnected');
    });
  });

  res.end();
}
