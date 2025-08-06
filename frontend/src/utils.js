export const createNewArgument = () => ({
    id: `arg-${Date.now()}-${Math.random()}`,
    name: '--new-arg',
    value: '',
    type: 'editable', // 'editable', 'fixed', 'previous-values', 'variable'
    isPositional: false,
    sourceCommandId: null, // For variable type
    regex: '', // For variable type
    enabled: true,
});

export const createNewCommand = () => ({
    id: `cmd-${Date.now()}-${Math.random()}`,
    name: 'New Command',
    executable: 'python',
    status: 'idle', // 'idle', 'running', 'success', 'error', 'stopped'
    output: [],
    errorOutput: [],
    generatedCommand: 'python --new-arg ',
    arguments: [createNewArgument()],
});