openssl genrsa -out ./key/private.pem 2048
openssl rsa -in ./key/private.pem -out ./key/public.pem -outform PEM -pubout

openssl genrsa -out ./key/private-gateway.pem 2048
openssl rsa -in ./key/private-gateway.pem -out ./key/public-gateway.pem -outform PEM -pubout