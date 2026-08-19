#!/usr/bin/env python3
"""
EMPACOTAMENTO DEFINITIVO DE PRODUÇÃO: FPAC STORE
Gera fpac_store_production_ready.zip, RELEASE_MANIFEST.json e fpac_store_production_ready.zip.sha256
Garante ausência total de ZIPs aninhados e valida integridade binária.
"""

import os
import zipfile
import hashlib
import json
import subprocess
import tempfile
import shutil
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PACKAGE_NAME = "fpac_store_production_ready.zip"
SHA256_FILE_NAME = "fpac_store_production_ready.zip.sha256"
MANIFEST_NAME = "RELEASE_MANIFEST.json"

PACKAGE_PATH = os.path.join(BASE_DIR, PACKAGE_NAME)
SHA256_FILE_PATH = os.path.join(BASE_DIR, SHA256_FILE_NAME)
MANIFEST_PATH = os.path.join(BASE_DIR, MANIFEST_NAME)

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def get_project_files():
    files_to_pack = []

    # 1. Arquivos de Configuração e Documentação Raiz
    root_files = [
        "PRODUCTION_READINESS_REPORT.md",
        "DEPLOYMENT_RUNBOOK.md",
        "ROLLBACK_RUNBOOK.md",
        "firestore.rules",
        "firestore.indexes.json",
        "storage.rules",
        "firebase.json",
        ".firebaserc",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "tsconfig.node.json",
        "vite.config.ts",
        "tailwind.config.js",
        "postcss.config.js",
        "metadata.json",
        ".env.example",
        "server.ts",
        "index.html"
    ]

    for rf in root_files:
        p = os.path.join(BASE_DIR, rf)
        if os.path.exists(p) and os.path.isfile(p):
            files_to_pack.append((p, rf))

    # 2. Diretórios Essenciais (src, server, scripts, dist, public)
    target_dirs = ["src", "server", "scripts", "dist", "public"]
    for dir_name in target_dirs:
        dir_path = os.path.join(BASE_DIR, dir_name)
        if os.path.exists(dir_path):
            for root, _, files in os.walk(dir_path):
                for f in sorted(files):
                    # Não incluir arquivos zip ou temporários
                    if f.endswith((".zip", ".sha256", ".log", ".tmp", ".DS_Store")):
                        continue
                    full_p = os.path.join(root, f)
                    rel_p = os.path.relpath(full_p, BASE_DIR)
                    files_to_pack.append((full_p, rel_p))

    # Ordenar por caminho relativo para garantir determinismo
    files_to_pack.sort(key=lambda x: x[1])
    return files_to_pack

def create_manifest(files):
    print("📋 [1/4] Gerando RELEASE_MANIFEST.json...")
    manifest_entries = []
    for full_p, rel_p in files:
        manifest_entries.append({
            "path": rel_p,
            "sha256": compute_sha256(full_p),
            "bytes": os.path.getsize(full_p)
        })

    manifest_data = {
        "release": "FPAC_STORE_PRODUCTION_READY",
        "app": "F PAC STORE",
        "domain": "https://fpacstore.com.br",
        "certifiedBase": "FASE 9.6.8 (15/15 suítes aprovadas)",
        "filesCount": len(manifest_entries),
        "files": manifest_entries
    }

    with open(MANIFEST_PATH, "w", encoding="utf-8") as mf:
        json.dump(manifest_data, mf, indent=2)

    print(f"✅ [OK] RELEASE_MANIFEST.json gerado com {len(manifest_entries)} entradas.")
    return MANIFEST_PATH

def create_production_zip(files, manifest_path):
    print(f"\n📦 [2/4] Criando pacote binário único {PACKAGE_NAME}...")
    if os.path.exists(PACKAGE_PATH):
        os.remove(PACKAGE_PATH)

    with zipfile.ZipFile(PACKAGE_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for full_p, rel_p in files:
            zf.write(full_p, rel_p)
        zf.write(manifest_path, MANIFEST_NAME)

    assert zipfile.is_zipfile(PACKAGE_PATH), "O arquivo gerado não é um ZIP válido"
    with zipfile.ZipFile(PACKAGE_PATH, "r") as zf:
        assert zf.testzip() is None, "Falha no teste de integridade do ZIP"

    package_sha256 = compute_sha256(PACKAGE_PATH)
    print(f"✅ [OK] {PACKAGE_NAME} criado com sucesso (SHA-256: {package_sha256})")
    return package_sha256

def validate_extraction_and_no_nested_zips():
    print(f"\n🔍 [3/4] Validando extração e ausência total de ZIPs aninhados...")
    temp_dir = tempfile.mkdtemp(prefix="fpac_prod_verify_")
    try:
        with zipfile.ZipFile(PACKAGE_PATH, "r") as zf:
            zf.extractall(temp_dir)

        # Confirmar ZERO arquivos .zip dentro do zip extraído
        nested_zips = []
        for root, _, files in os.walk(temp_dir):
            for f in files:
                if f.endswith(".zip"):
                    nested_zips.append(f)
        assert len(nested_zips) == 0, f"VIOLAÇÃO: Encontrados ZIPs aninhados: {nested_zips}"
        print("✅ [OK] Confirmado: 0 arquivos ZIP aninhados no interior do pacote.")

        # Testar via comando de sistema unzip -t
        unzip_res = subprocess.run(["unzip", "-t", PACKAGE_PATH], capture_output=True, text=True)
        assert unzip_res.returncode == 0, f"Erro no unzip -t:\n{unzip_res.stderr}"
        print("✅ [OK] Validação via unzip -t: 0 erros.")

        # Validar manifesto
        extracted_manifest_path = os.path.join(temp_dir, MANIFEST_NAME)
        assert os.path.exists(extracted_manifest_path), "RELEASE_MANIFEST.json não encontrado após extração"
        with open(extracted_manifest_path, "r", encoding="utf-8") as mf:
            manifest = json.load(mf)

        for item in manifest["files"]:
            p = os.path.join(temp_dir, item["path"])
            assert os.path.exists(p), f"Arquivo do manifesto ausente na extração: {item['path']}"
            assert compute_sha256(p) == item["sha256"], f"Divergência de hash no arquivo: {item['path']}"

        print(f"✅ [OK] Integridade total confirmada para todos os {len(manifest['files'])} itens.")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

def generate_checksum_file(package_sha256):
    print(f"\n🔐 [4/4] Gerando assinatura {SHA256_FILE_NAME}...")
    content = f"{package_sha256}  {PACKAGE_NAME}\n"
    with open(SHA256_FILE_PATH, "w", encoding="utf-8") as sf:
        sf.write(content)

    with open(SHA256_FILE_PATH, "r", encoding="utf-8") as sf:
        read_hash = sf.read().strip().split()[0]
    assert read_hash == package_sha256, "Hash gravado difere do pacote"
    print(f"✅ [OK] {SHA256_FILE_NAME} gerado e validado: {package_sha256}")

def main():
    # Limpar pacotes obsoletos antes da execução
    obsolete_files = [
        "fpac_store_phase_9_6_8_audit.zip",
        "fpac_store_phase_9_6_8_g_final_release.zip",
        "fpac_store_phase_9_6_8_g_final_release.zip.sha256",
        "fpac_store_phase_9_6_8_g_1_final_release.zip",
        "fpac_store_phase_9_6_8_g_1_final_release.zip.sha256"
    ]
    for obs in obsolete_files:
        p = os.path.join(BASE_DIR, obs)
        if os.path.exists(p):
            os.remove(p)

    files = get_project_files()
    manifest_path = create_manifest(files)
    package_sha256 = create_production_zip(files, manifest_path)
    validate_extraction_and_no_nested_zips()
    generate_checksum_file(package_sha256)

    print("\n========================================================================")
    print("🎉 PACOTE DE PRODUÇÃO FPAC STORE GERADO COM SUCESSO!")
    print(f"📦 Pacote Único: {PACKAGE_NAME}")
    print(f"🔑 Checksum:     {SHA256_FILE_NAME}")
    print(f"🛡️ SHA-256:      {package_sha256}")
    print("========================================================================")

if __name__ == "__main__":
    main()
