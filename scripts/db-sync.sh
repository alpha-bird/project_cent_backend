#!/bin/bash

cd ./db

# Push the schema state we have in our local sql files to the db
skeema push

cd ..

exit 0
