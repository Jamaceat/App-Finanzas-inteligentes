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

CODIGO_LAN="$(read_var CODIGO_LAN)"
DIRECCION_IP_DISPOSITIVO="$(read_var DIRECCION_IP_DISPOSITIVO)"
PUERTO="$(read_var PUERTO)"
PUERTO_DEPURACION="$(read_var PUERTO_DEPURACION)"

do_pair() {
  echo "Emparejando con $DIRECCION_IP_DISPOSITIVO:$PUERTO..."
  if OUTPUT="$(adb pair "$DIRECCION_IP_DISPOSITIVO:$PUERTO" "$CODIGO_LAN" 2>&1)" && echo "$OUTPUT" | grep -qi "Successfully paired"; then
    echo "$OUTPUT"
    echo "Emparejado con éxito."
  else
    echo "$OUTPUT" >&2
    echo "Falló el emparejamiento. Generá un nuevo código en 'Vincular dispositivo con código de vinculación' en la tablet, actualizá CODIGO_LAN/DIRECCION_IP_DISPOSITIVO/PUERTO en .env y reintentá." >&2
    exit 1
  fi
}

try_connect() {
  echo "Conectando a $DIRECCION_IP_DISPOSITIVO:$PUERTO_DEPURACION..."
  if OUTPUT="$(adb connect "$DIRECCION_IP_DISPOSITIVO:$PUERTO_DEPURACION" 2>&1)" && echo "$OUTPUT" | grep -qi "connected to"; then
    echo "$OUTPUT"
    echo "Conectado con éxito."
    return 0
  else
    echo "$OUTPUT" >&2
    return 1
  fi
}

case "${1:-}" in
  pair)
    do_pair
    ;;
  connect)
    if ! try_connect; then
      echo "No se pudo conectar directamente: emparejando primero..."
      do_pair
      CODIGO_LAN="$(read_var CODIGO_LAN)"
      DIRECCION_IP_DISPOSITIVO="$(read_var DIRECCION_IP_DISPOSITIVO)"
      PUERTO="$(read_var PUERTO)"
      PUERTO_DEPURACION="$(read_var PUERTO_DEPURACION)"
      if ! try_connect; then
        echo "No se pudo conectar (probablemente cambió PUERTO_DEPURACION en la tablet). Actualizá CODIGO_LAN/PUERTO con el diálogo de vinculación y PUERTO_DEPURACION con el puerto de la pantalla principal de 'Depuración inalámbrica' de la tablet." >&2
        exit 1
      fi
    fi
    ;;
  *)
    echo "Uso: $0 {pair|connect}" >&2
    exit 1
    ;;
esac
