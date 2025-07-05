import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { registerCommands } from './modules/commands.js';

function generateZshCompletion() {
	const program = new Command();
	// We need to register the commands to inspect them.
	registerCommands(program);

	const commands = program.commands.map((cmd) => cmd.name());

	let script = `#compdef task-master tm taskmaster

_task_master() {
    local state line
    typeset -A opt_args

    _arguments -C \\
        "1: :->commands" \\
        "*: :->args"

    case $state in
        commands)
            _values 'task-master commands' \\
                ${commands.map(cmd => `'${cmd}[${cmd} command]'`).join(' \\\n                ')}
            ;;
        args)
            case $words[2] in
                ${commands.map(cmd => `${cmd})\n                    _task_master_${cmd.replace(/-/g, '_')}\n                    ;;`).join('\n                ')}
            esac
            ;;
    esac
}

${commands.map(cmd => {
	const funcName = cmd.replace(/-/g, '_');
	return `_task_master_${funcName}() {
    _arguments \\
        '--help[Show help]' \\
        $(task-master ${cmd} --help 2>/dev/null | grep -oE -- '--[a-zA-Z-]+' | sed 's/^/"/;s/$/[option]"/')
}`;
}).join('\n\n')}

_task_master "$@"
`;

	const outputPath = path.resolve(process.cwd(), 'scripts/_task-master-completion');
	fs.writeFileSync(outputPath, script);
	console.log(`Zsh completion script generated at: ${outputPath}`);
	console.log(`To use it, place it in your fpath (e.g., ~/.zsh/completions/) and run: autoload -U compinit && compinit`);
}

generateZshCompletion();