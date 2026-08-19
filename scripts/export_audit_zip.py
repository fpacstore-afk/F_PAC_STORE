import os
import zipfile

OUTPUT_ZIP = 'fpac_store_phase_9_6_8_audit.zip'
EXCLUDE_DIRS = {'node_modules', '.git', 'dist', '.cache', '__pycache__'}
EXCLUDE_EXTS = {'.zip', '.tar.gz', '.tgz'}

def create_audit_zip():
    print(f"Creating {OUTPUT_ZIP} for external audit...")
    file_count = 0
    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk('.'):
            # Filtrar diretórios ignorados no local walk
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith('.')]
            for file in files:
                if any(file.endswith(ext) for ext in EXCLUDE_EXTS):
                    continue
                file_path = os.path.join(root, file)
                # Salvar caminho relativo limpo
                arcname = os.path.relpath(file_path, '.')
                zipf.write(file_path, arcname)
                file_count += 1
    
    zip_size_mb = os.path.getsize(OUTPUT_ZIP) / (1024 * 1024)
    print(f"Export completed: {file_count} files archived ({zip_size_mb:.2f} MB) in {OUTPUT_ZIP}")

if __name__ == '__main__':
    create_audit_zip()
