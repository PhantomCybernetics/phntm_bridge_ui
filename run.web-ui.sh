#!/bin/bash

echo "Compiling TypeScript..."
./node_modules/typescript/bin/tsc --pretty --allowUnreachableCode -p ./tsconfig/web_ui.json
CODE=$?;
#echo $CODE    # Exit status 0 returned because command executed successfully.

if [ $CODE -eq 0 ] ; then
	echo -e "\033[32m[tsc good, launching Web UI Server...]\033[0m"
	clear
	node ./build/WebUIServer.js "$@"
else
	echo -e "\033[41m[TypeScript errors detected, launch cancelled]\033[0m"
fi

