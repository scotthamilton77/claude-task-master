#!/usr/bin/env bash

_task_master_completion() {
    local cur prev words cword
    _get_comp_words_by_ref -n : cur prev words cword

    if [[ ${cword} -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "parse-prd update update-task update-subtask generate set-status list expand analyze-complexity research clear-subtasks add-task next show add-dependency remove-dependency validate-dependencies fix-dependencies complexity-report add-subtask remove-subtask remove-task init models move rules migrate sync-readme add-tag delete-tag tags use-tag rename-tag copy-tag" -- ${cur}) )
        return 0
    fi

    local command="${words[1]}"
    local options_help
    local base_cmd="${words[0]}"
    options_help=$(${base_cmd} ${command} --help 2>/dev/null)

    if [[ -n "${options_help}" ]]; then
        local options
        options=$(echo "${options_help}" | grep -oE -- '--[a-zA-Z-]+' | tr '\n' ' ')
        if [[ ${cur} == "--" ]]; then
            COMPREPLY=( ${options} )
        else
            COMPREPLY=( $(compgen -W "${options}" -- ${cur}) )
        fi
    fi
}

complete -F _task_master_completion task-master
complete -F _task_master_completion tm
complete -F _task_master_completion taskmaster
