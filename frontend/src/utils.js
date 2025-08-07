export const createNewArgument = () => ({
    id: `arg-${Date.now()}-${Math.random()}`,
    name: '--new-arg',
    value: '',
    isPositional: false,
    isFromOutput: false,
    joiner: ' ',
    sourceCommandId: null,
    regex: '',
    enabled: true,
});

export const createNewCommand = () => ({
    id: `cmd-${Date.now()}-${Math.random()}`,
    name: 'New Command',
    executable: '',
    workingDirectory: '',
    arguments: [],
    dependsOn: [],
    status: 'idle', // idle, running, success, error, stopped
    output: [],
    errorOutput: [],
    generatedCommand: '',
});