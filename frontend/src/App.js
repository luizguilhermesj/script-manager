import React from 'react';
import CommandCard from './components/CommandCard';
import { PlusIcon } from './components/Icons';
import { useCommands } from './hooks/useCommands';
import { Toaster, toast } from 'react-hot-toast';

function App() {
    const { commands, loading, addCommand, updateCommand, deleteCommand, runCommand, stopCommand, runChain } = useCommands();

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <Toaster position="bottom-right" />
            <div className="container mx-auto p-4 md:p-8">
                <header className="mb-8">
                    <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
                        Command Chain <span className="text-indigo-400">Dashboard</span>
                    </h1>
                    <p className="mt-3 text-lg text-gray-400">
                        Visually manage, run, and chain your command-line scripts.
                    </p>
                </header>

                <main>
                    {loading ? (
                        <div className="text-center">
                            <p className="text-lg text-gray-400">Loading commands...</p>
                        </div>
                    ) : (
                        commands.map(cmd => (
                            <CommandCard
                                key={cmd.id}
                                command={cmd}
                                updateCommand={updateCommand}
                                deleteCommand={() => deleteCommand(cmd.id).catch(() => toast.error("Failed to delete command."))}
                                runCommand={() => runCommand(cmd.id).catch(() => toast.error("Failed to run command."))}
                                stopCommand={() => stopCommand(cmd.id).catch(() => toast.error("Failed to stop command."))}
                                runChain={runChain}
                                commands={commands}
                            />
                        ))
                    )}

                    {!loading && (
                        <div className="mt-8 text-center">
                            <button
                                onClick={addCommand}
                                className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-lg transition-colors inline-flex items-center gap-2"
                            >
                                <PlusIcon />
                                Add New Command
                            </button>
                        </div>
                    )}
                </main>

                <footer className="text-center mt-12 text-gray-500 text-sm">
                    <p>Built with React & Tailwind CSS. Processes are executed by the Python backend.</p>
                </footer>
            </div>
        </div>
    );
}

export default App;