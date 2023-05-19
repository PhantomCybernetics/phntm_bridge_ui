#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"


echo "Making a self signed certificate in $DIR/ ...\n"


 openssl genrsa 1024 > $DIR/private.pem
 openssl req -new -key $DIR/private.pem -out $DIR/csr.pem
 openssl x509 -req -days 365 -in $DIR/csr.pem -signkey $DIR/private.pem -out $DIR/public.crt

 echo "\n\nAll done, restart the service!"


