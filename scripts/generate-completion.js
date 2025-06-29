import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { registerCommands } from './modules/commands.js';

function generateBashCompletion() {
    const program = new Command();
    // We need to register the commands to inspect them.
    registerCommands(program);

    const commands = program.commands.map(cmd => cmd.name());

    let script = `#!/usr/bin/env bash

_task_master_completion() {
    local cur prev words cword
    _get_comp_words_by_ref -n : cur prev words cword

    if [[ \${cword} -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "${commands.join(' ')}" -- \${cur}) )
        return 0
    fi

    local command="\${words[1]}"
    local options_help
    options_help=$(task-master \${command} --help 2>/dev/null)

    if [[ -n "\${options_help}" ]]; then
        local options
        options=$(echo "\${options_help}" | grep -oE -- '--[a-zA-Z-]+' | tr '\\n' ' ')
        if [[ \${cur} == "--" ]]; then
            COMPREPLY=( \${options} )
        else
            COMPREPLY=( $(compgen -W "\${options}" -- \${cur}) )
        fi
    fi
}

complete -F _task_master_completion task-master
`;

    const outputPath = path.resolve(process.cwd(), 'task-master-completion.sh');
    fs.writeFileSync(outputPath, script);
    console.log(`Bash completion script generated at: ${outputPath}`);
    console.log(`To use it, run: source ${outputPath}`);
}

generateBashCompletion();