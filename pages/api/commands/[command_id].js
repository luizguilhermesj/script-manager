import { initializeDatabase } from '@lib/db';
import { processes, killProcess } from '@lib/processes';

export default async function handler(req, res) {
  const { command_id } = req.query;
  const db = await initializeDatabase();
  const io = res.socket.server.io;

  if (req.method === 'PUT') {
    const data = req.body;
    // TODO: Add back dependency validation
    await db.run(`UPDATE commands SET data = ? WHERE id = ?`, [JSON.stringify(data), command_id]);
    // TODO: Add back socket.io emit
    res.status(200).json(data);
  } else if (req.method === 'POST') {
    // Handle stop command
    console.log('All processes keys:', Object.keys(processes));
    console.log('All processes:', processes);
    const proc = processes[command_id];
    console.log('Stop request for command:', command_id);
    console.log('Process object:', proc);
    console.log('Process exitCode:', proc?.exitCode);
    console.log('Process killed:', proc?.killed);
    console.log('Process pid:', proc?.pid);

    // More robust check for running process
    const isRunning = proc &&
      (proc.exitCode === null || proc.exitCode === undefined) &&
      !proc.killed &&
      proc.pid;

    // Check if process is already terminated
    const isAlreadyTerminated = proc && (proc.killed || proc.exitCode !== null);

    if (isRunning) {
      try {
        // Use the helper function to kill the process
        killProcess(command_id);

        // Update the command status to 'stopped' immediately
        const row = await db.get("SELECT data FROM commands WHERE id = ?", [command_id]);
        if (row) {
          const commandDef = JSON.parse(row.data);
          commandDef.status = 'stopped';
          await db.run(`UPDATE commands SET data = ? WHERE id = ?`, [JSON.stringify(commandDef), command_id]);
          // Don't send output in status update to preserve accumulated output
          const { output, errorOutput, ...statusUpdate } = commandDef;
          io.emit('status_update', statusUpdate);

          // Don't immediately remove the process - let it finish naturally
          // The process will be cleaned up when the 'close' event fires
          console.log('Process kill signal sent, waiting for natural termination');
        }

        res.status(200).json({ message: 'Stop signal sent' });
      } catch (e) {
        // Process may have already exited
        res.status(200).json({ message: 'Stop signal sent' });
      }
    } else if (isAlreadyTerminated) {
      // Process is already terminated, just update the status
      console.log('Process already terminated, updating status');
      const row = await db.get("SELECT data FROM commands WHERE id = ?", [command_id]);
      if (row) {
        const commandDef = JSON.parse(row.data);
        commandDef.status = 'stopped';
        await db.run(`UPDATE commands SET data = ? WHERE id = ?`, [JSON.stringify(commandDef), command_id]);
        // Don't send output in status update to preserve accumulated output
        const { output, errorOutput, ...statusUpdate } = commandDef;
        io.emit('status_update', statusUpdate);
      }
      res.status(200).json({ message: 'Command already stopped' });
    } else {
      res.status(400).json({ error: 'Command is not running' });
    }
  } else {
    res.setHeader('Allow', ['PUT', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
