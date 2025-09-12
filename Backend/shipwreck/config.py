from prompts import SQL_SUFFIX


sql_agent_args = {
        "agent_type": 'openai-tools',
        "prefix":"",
        "top_k": 1000, 
        "suffix": SQL_SUFFIX, 
        "input_variables":["input", "agent_scratchpad", "history"],
        "verbose": True, 
        "return_intermediate_steps": True,
        "handle_parsing_errors": True, 
        "format_instructions": "",
        "agent_executor_kwargs": {
            "return_intermediate_steps": True,
            "include_columns": True
        }

    }