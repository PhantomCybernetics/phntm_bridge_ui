#!/bin/bash

echo "Compiling TypeScript..."
tsc --pretty --allowUnreachableCode -p ./tsconfig/sessionMaster.json
CODE=$?;
#echo $CODE    # Exit status 0 returned because command executed successfully.

if [ $CODE -eq 0 ] ; then
	echo -e "\033[32m[tsc good, launching Session Master...]\033[0m"
	clear
	node ./built/SessionMaster.js "$@"
else
	echo -e "\033[41m[TypeScript errors detected, launch cancelled]\033[0m"
fi

