#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Making a self signed certificate in $DIR/ ..."

openssl req -config $DIR/openssl.conf -new -x509 -sha256 -newkey rsa:2048 -nodes -days 1000 -keyout $DIR/private.key.pem -out $DIR/public.cert.pem

echo "All done"