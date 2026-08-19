#!/usr/bin/env python3
"""
BUILD SCRIPT DEFINITIVO: FASE 9.6.8-G.1 RELEASE & AUDIT PACKAGING
Gera artefatos binários estritamente válidos, manifestos SHA-256,
validação de integridade pós-extração e assinatura .sha256 externa.
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
AUDIT_ZIP_NAME = "fpac_store_phase_9_6_8_audit.zip"
RELEASE_ZIP_NAME = "fpac_store_phase_9_6_8_g_1_final_release.zip"
SHA256_FILE_NAME = "fpac_store_phase_9_6_8_g_1_final_release.zip.sha256"

AUDIT_ZIP_PATH = os.path.join(BASE_DIR, AUDIT_ZIP_NAME)
RELEASE_ZIP_PATH = os.path.join(BASE_DIR, RELEASE_ZIP_NAME)
SHA256_FILE_PATH = os.path.join(BASE_DIR, SHA256_FILE_NAME)

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def get_core_files():
    """Coleta arquivos essenciais do projeto para auditoria e release."""
    files_to_pack = []
    
    # Arquivos raiz
    root_files = [
        "firestore.rules",
        "firestore.indexes.json",
        "firebase.json",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "tsconfig.node.json",
        "vite.config.ts",
        "tailwind.config.js",
        "postcss.config.js",
        "metadata.json"
    ]
    
    for rf in root_files:
        p = os.path.join(BASE_DIR, rf)
        if os.path.exists(p):
            files_to_pack.append((p, rf))
            
    # Scripts de teste
    test_scripts = [
        "scripts/test_phase_9_6_8_e_final.ts",
        "scripts/test_phase_9_6_8_g_final.ts",
        "scripts/test_phase_9_6_8_g_1_emulator.ts",
        "scripts/build_phase_9_6_8_g_release.py"
    ]
    for ts in test_scripts:
        p = os.path.join(BASE_DIR, ts)
        if os.path.exists(p):
            files_to_pack.append((p, ts))

    # Diretórios recursivos: src e server
    for dir_name in ["src", "server"]:
        dir_path = os.path.join(BASE_DIR, dir_name)
        if os.path.exists(dir_path):
            for root, _, files in os.walk(dir_path):
                for f in sorted(files):
                    if f.endswith((".ts", ".tsx", ".js", ".jsx", ".json", ".css")):
                        full_p = os.path.join(root, f)
                        rel_p = os.path.relpath(full_p, BASE_DIR)
                        files_to_pack.append((full_p, rel_p))

    return files_to_pack

def create_audit_zip():
    print(f"📦 [1/5] Gerando {AUDIT_ZIP_NAME} em modo binário puro...")
    if os.path.exists(AUDIT_ZIP_PATH):
        os.remove(AUDIT_ZIP_PATH)

    files = get_core_files()
    with zipfile.ZipFile(AUDIT_ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for full_p, rel_p in files:
            zf.write(full_p, rel_p)

    assert zipfile.is_zipfile(AUDIT_ZIP_PATH), "Audit zip não é um zipfile válido"
    with zipfile.ZipFile(AUDIT_ZIP_PATH, "r") as zf:
        assert zf.testzip() is None, "Audit zip falhou no teste de integridade"
    print(f"✅ [OK] {AUDIT_ZIP_NAME} gerado com {len(files)} arquivos (SHA-256: {compute_sha256(AUDIT_ZIP_PATH)})")

def create_release_zip():
    print(f"\n📦 [2/5] Gerando Manifesto e {RELEASE_ZIP_NAME}...")
    if os.path.exists(RELEASE_ZIP_PATH):
        os.remove(RELEASE_ZIP_PATH)

    files = get_core_files()
    manifest_entries = []

    for full_p, rel_p in files:
        manifest_entries.append({
            "path": rel_p,
            "sha256": compute_sha256(full_p),
            "bytes": os.path.getsize(full_p)
        })

    # Adicionar o audit zip no release e no manifesto
    manifest_entries.append({
        "path": AUDIT_ZIP_NAME,
        "sha256": compute_sha256(AUDIT_ZIP_PATH),
        "bytes": os.path.getsize(AUDIT_ZIP_PATH)
    })

    manifest_data = {
        "release": "FASE_9_6_8_G_1_FINAL",
        "app": "FPAC Store",
        "description": "Certificação Real no Firebase Emulator e Entrega Binária Direta FASE 9.6.8-G.1",
        "auditZipSha256": compute_sha256(AUDIT_ZIP_PATH),
        "filesCount": len(manifest_entries),
        "files": manifest_entries
    }

    manifest_path = os.path.join(BASE_DIR, "RELEASE_MANIFEST.json")
    with open(manifest_path, "w", encoding="utf-8") as mf:
        json.dump(manifest_data, mf, indent=2)

    with zipfile.ZipFile(RELEASE_ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for full_p, rel_p in files:
            zf.write(full_p, rel_p)
        zf.write(AUDIT_ZIP_PATH, AUDIT_ZIP_NAME)
        zf.write(manifest_path, "RELEASE_MANIFEST.json")

    # Fechamento garantido pelo context manager with
    assert zipfile.is_zipfile(RELEASE_ZIP_PATH), "Release zip não é um zipfile válido"
    with zipfile.ZipFile(RELEASE_ZIP_PATH, "r") as zf:
        assert zf.testzip() is None, "Release zip falhou no teste de integridade"
    
    release_sha256 = compute_sha256(RELEASE_ZIP_PATH)
    print(f"✅ [OK] {RELEASE_ZIP_NAME} gerado com sucesso (SHA-256: {release_sha256})")
    return release_sha256

def validate_extraction_and_manifest():
    print(f"\n🔍 [3/5] Extração em diretório temporário e validação rigorosa...")
    temp_dir = tempfile.mkdtemp(prefix="fpac_release_verify_")
    try:
        # Extrair release zip no diretório temporário
        with zipfile.ZipFile(RELEASE_ZIP_PATH, "r") as zf:
            zf.extractall(temp_dir)
        print(f"📂 Release extraído com sucesso em diretório temporário: {temp_dir}")

        # Localizar audit zip extraído
        extracted_audit_path = os.path.join(temp_dir, AUDIT_ZIP_NAME)
        assert os.path.exists(extracted_audit_path), f"Audit zip não encontrado em {temp_dir}"
        assert zipfile.is_zipfile(extracted_audit_path), "Audit zip extraído não é um arquivo ZIP válido"
        with zipfile.ZipFile(extracted_audit_path, "r") as azf:
            assert azf.testzip() is None, "Audit zip extraído falhou no testzip()"
        
        # Testar via comando unzip -t
        unzip_audit_res = subprocess.run(["unzip", "-t", extracted_audit_path], capture_output=True, text=True)
        assert unzip_audit_res.returncode == 0, f"Falha no unzip -t do audit zip extraído:\n{unzip_audit_res.stderr}"
        print(f"✅ [OK] Audit ZIP extraído validado com 0 erros via zipfile e unzip -t.")

        # Verificar se existe EXATAMENTE UM zip dentro do release
        extracted_zips = []
        for root, _, files in os.walk(temp_dir):
            for f in files:
                if f.endswith(".zip"):
                    extracted_zips.append(f)
        assert extracted_zips == [AUDIT_ZIP_NAME], f"Esperado exatamente 1 ZIP ({AUDIT_ZIP_NAME}), encontrados: {extracted_zips}"
        print(f"✅ [OK] Confirmado exatamente 1 arquivo ZIP dentro do release: {AUDIT_ZIP_NAME}")

        # Validar manifesto extraído
        extracted_manifest_path = os.path.join(temp_dir, "RELEASE_MANIFEST.json")
        assert os.path.exists(extracted_manifest_path), "RELEASE_MANIFEST.json não encontrado após extração"
        with open(extracted_manifest_path, "r", encoding="utf-8") as mf:
            manifest = json.load(mf)

        # Comparar todos os arquivos com o manifesto
        manifest_files = {item["path"]: item for item in manifest["files"]}
        assert len(manifest_files) == manifest["filesCount"], "filesCount diverge do total de entradas no manifesto"

        for rel_path, item in manifest_files.items():
            extracted_file_path = os.path.join(temp_dir, rel_path)
            assert os.path.exists(extracted_file_path), f"Arquivo do manifesto ausente na extração: {rel_path}"
            extracted_sha = compute_sha256(extracted_file_path)
            assert extracted_sha == item["sha256"], f"Divergência de SHA-256 para {rel_path}: esperado {item['sha256']}, obtido {extracted_sha}"
            assert os.path.getsize(extracted_file_path) == item["bytes"], f"Divergência de tamanho para {rel_path}"

        print(f"✅ [OK] Comparação com RELEASE_MANIFEST.json: 0 arquivos ausentes, extras ou divergentes ({len(manifest_files)} itens verificados).")

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

def generate_external_sha256(release_sha256):
    print(f"\n🔐 [4/5] Gerando arquivo de assinatura externa {SHA256_FILE_NAME}...")
    sha256_content = f"{release_sha256}  {RELEASE_ZIP_NAME}\n"
    with open(SHA256_FILE_PATH, "w", encoding="utf-8") as sf:
        sf.write(sha256_content)

    # Validar que a leitura do arquivo .sha256 bate com o hash
    with open(SHA256_FILE_PATH, "r", encoding="utf-8") as sf:
        read_content = sf.read().strip()
    read_hash = read_content.split()[0]
    assert read_hash == release_sha256, f"Hash no arquivo .sha256 ({read_hash}) difere do release ({release_sha256})"
    print(f"✅ [OK] {SHA256_FILE_NAME} gerado e verificado:")
    print(f"       {sha256_content.strip()}")

def validate_packages_unzip():
    print(f"\n🔍 [5/5] Validação final via unzip -t nos arquivos gerados...")
    for p in [AUDIT_ZIP_PATH, RELEASE_ZIP_PATH]:
        res = subprocess.run(["unzip", "-t", p], capture_output=True, text=True)
        assert res.returncode == 0, f"Falha na validação unzip -t em {p}:\n{res.stderr}"
        print(f"✅ [OK] unzip -t {os.path.basename(p)}: 0 erros.")

def main():
    create_audit_zip()
    release_sha = create_release_zip()
    validate_extraction_and_manifest()
    generate_external_sha256(release_sha)
    validate_packages_unzip()

    print("\n========================================================================")
    print("🎉 RELEASE DA FASE 9.6.8-G.1 EMPACOTADO E CERTIFICADO COM SUCESSO!")
    print(f"📦 Arquivo Release: {RELEASE_ZIP_NAME}")
    print(f"🔑 Arquivo Hash:    {SHA256_FILE_NAME}")
    print(f"🛡️ SHA-256 Final:   {release_sha}")
    print("========================================================================")

if __name__ == "__main__":
    main()
