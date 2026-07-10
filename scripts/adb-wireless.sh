#!/usr/bin/env bash
# Empareja y/o conecta adb inalámbrico usando los valores del .env
# (ver env.template). Pensado para ser llamado desde el Makefile:
#   make wireless-pair
#   make wireless-connect
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "No existe .env. Copiá env.template a .env y completá los datos de la tablet." >&2
  exit 1
fi

read_var() {
  # Extrae "CLAVE=valor" del .env, tolerando espacios alrededor del '='
  grep -E "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE" | tail -n1 | cut -d'=' -f2- | xargs
}

set_var() {
  local key="$1" value="$2"
  if grep -qE "^[[:space:]]*$key[[:space:]]*=" "$ENV_FILE"; then
    sed -i -E "s|^[[:space:]]*$key[[:space:]]*=.*|$key=$value|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

CODIGO_LAN="$(read_var CODIGO_LAN)"
DIRECCION_IP_DISPOSITIVO="$(read_var DIRECCION_IP_DISPOSITIVO)"
PUERTO="$(read_var PUERTO)"
PUERTO_DEPURACION="$(read_var PUERTO_DEPURACION)"
ACTIVE="$(read_var ACTIVE)"

do_pair() {
  echo "Emparejando con $DIRECCION_IP_DISPOSITIVO:$PUERTO..."
  if OUTPUT="$(adb pair "$DIRECCION_IP_DISPOSITIVO:$PUERTO" "$CODIGO_LAN" 2>&1)" && echo "$OUTPUT" | grep -qi "Successfully paired"; then
    echo "$OUTPUT"
    set_var ACTIVE TRUE
    echo "Emparejado con éxito. ACTIVE=TRUE guardado en .env."
  else
    echo "$OUTPUT" >&2
    set_var ACTIVE FALSE
    echo "Falló el emparejamiento. Generá un nuevo código en 'Vincular dispositivo con código de vinculación' en la tablet, actualizá CODIGO_LAN/DIRECCION_IP_DISPOSITIVO/PUERTO en .env y reintentá." >&2
    exit 1
  fi
}

do_connect() {
  echo "Conectando a $DIRECCION_IP_DISPOSITIVO:$PUERTO_DEPURACION..."
  if OUTPUT="$(adb connect "$DIRECCION_IP_DISPOSITIVO:$PUERTO_DEPURACION" 2>&1)" && echo "$OUTPUT" | grep -qi "connected to"; then
    echo "$OUTPUT"
    set_var ACTIVE TRUE
    echo "Conectado con éxito."
  else
    echo "$OUTPUT" >&2
    set_var ACTIVE FALSE
    echo "No se pudo conectar (probablemente cambió PUERTO_DEPURACION en la tablet). ACTIVE=FALSE guardado en .env: la próxima vez que corras 'make wireless-connect' se intentará re-emparejar. Actualizá CODIGO_LAN/PUERTO con el diálogo de vinculación y PUERTO_DEPURACION con el puerto de la pantalla principal de 'Depuración inalámbrica' de la tablet." >&2
    exit 1
  fi
}

case "${1:-}" in
  pair)
    do_pair
    ;;
  connect)
    if [ "$(printf '%s' "$ACTIVE" | tr '[:lower:]' '[:upper:]')" != "TRUE" ]; then
      echo "ACTIVE no es TRUE en .env: emparejando primero..."
      do_pair
      CODIGO_LAN="$(read_var CODIGO_LAN)"
      DIRECCION_IP_DISPOSITIVO="$(read_var DIRECCION_IP_DISPOSITIVO)"
      PUERTO="$(read_var PUERTO)"
      PUERTO_DEPURACION="$(read_var PUERTO_DEPURACION)"
    fi
    do_connect
    ;;
  *)
    echo "Uso: $0 {pair|connect}" >&2
    exit 1
    ;;
esac
