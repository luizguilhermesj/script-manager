import React, { useState, useEffect } from 'react';
import './App.css';

const API_URL = 'http://127.0.0.1:5000';

function App() {
  const [commands, setCommands] = useState([]);
  const [newCommand, setNewCommand] = useState('');

  const fetchCommands = async () => {
    try {
      const response = await fetch(`${API_URL}/commands`);
      const data = await response.json();
      setCommands(data);
    } catch (error) {
      console.error('Error fetching commands:', error);
    }
  };

  useEffect(() => {
    fetchCommands();
    const interval = setInterval(fetchCommands, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleCreateCommand = async (e) => {
    e.preventDefault();
    if (!newCommand) return;
    try {
      await fetch(`${API_URL}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: newCommand }),
      });
      setNewCommand('');
      fetchCommands();
    } catch (error) {
      console.error('Error creating command:', error);
    }
  };

  const handleRunCommand = async (commandId) => {
    try {
      await fetch(`${API_URL}/commands/${commandId}/run`, { method: 'POST' });
      fetchCommands();
    } catch (error) {
      console.error('Error running command:', error);
    }
  };

  const handleStopCommand = async (commandId) => {
    try {
      await fetch(`${API_URL}/commands/${commandId}/stop`, { method: 'POST' });
      fetchCommands();
    } catch (error) {
      console.error('Error stopping command:', error);
    }
  };

  const fetchCommandDetails = async (commandId) => {
    try {
      const response = await fetch(`${API_URL}/commands/${commandId}`);
      const data = await response.json();
      setCommands(currentCommands =>
        currentCommands.map(c => c.id === commandId ? data : c)
      );
    } catch (error) {
      console.error('Error fetching command details:', error);
    }
  };

  return (
    <div className="App">
      <header>
        <h1>Command Dashboard</h1>
        <form onSubmit={handleCreateCommand}>
          <input
            type="text"
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            placeholder="Enter a new command"
          />
          <button type="submit">Create Command</button>
        </form>
      </header>
      <main className="command-list">
        {commands.map((command) => (
          <div key={command.id} className="command-card">
            <h3><code>{command.command}</code></h3>
            <p className={`status ${command.status}`}>{command.status}</p>
            <div className="actions">
              <button onClick={() => handleRunCommand(command.id)} disabled={command.status === 'running'}>Run</button>
              <button onClick={() => handleStopCommand(command.id)} disabled={command.status !== 'running'}>Stop</button>
              <button onClick={() => fetchCommandDetails(command.id)}>Refresh</button>
            </div>
            {(command.stdout || command.stderr) && (
              <div className="output">
                {command.stdout && command.stdout.length > 0 && (
                  <div>
                    <h4>stdout</h4>
                    <pre>{command.stdout.join('')}</pre>
                  </div>
                )}
                {command.stderr && command.stderr.length > 0 && (
                  <div>
                    <h4>stderr</h4>
                    <pre>{command.stderr.join('')}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}

export default App;
