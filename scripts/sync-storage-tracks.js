/**
 * SCRIPT DE AUTOMAÇÃO - RÁDIO F PAC SOUND
 * 
 * Este script automatiza o mapeamento de arquivos .mp3 na pasta "Musicas do Site"
 * do Firebase Storage e os cadastra na coleção "music" do Firestore.
 * 
 * COMO USAR:
 * 1. Certifique-se de ter o 'firebase-admin' instalado:
 *    npm install firebase-admin
 * 
 * 2. Baixe uma chave de conta de serviço em formato JSON do Console do Firebase:
 *    Console Firebase > Configurações do Projeto > Contas de Serviço > Gerar Nova Chave Privada
 * 
 * 3. Salve o arquivo como 'service-account.json' na raiz do projeto (ou passe o caminho por variável de ambiente).
 * 
 * 4. Execute o script:
 *    node scripts/sync-storage-tracks.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Configurações
const STORAGE_FOLDER = 'Musicas do Site'; // Pasta principal no Storage
const MUSIC_COLLECTION = 'music'; // Coleção ativa usada pelo player do site
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop';

// Tenta carregar credenciais
const serviceAccountPath = path.join(__dirname, '../service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('\n❌ ERRO: Arquivo "service-account.json" não encontrado na raiz do projeto!');
  console.log('Por favor, baixe a chave de conta de serviço no Console do Firebase e coloque-a em:');
  console.log(`👉 ${path.resolve(serviceAccountPath)}`);
  console.log('\nAlternativamente, você pode usar o botão "Sincronizar Storage" direto no seu painel administrativo (/gestao > Rádio), que faz tudo isso de forma 100% automatizada com apenas 1 clique no navegador!');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

// Inicializa Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Substitua pelo seu storage bucket caso seja diferente ou use o automático do JSON
  storageBucket: serviceAccount.project_id + '.appspot.com' 
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function runSync() {
  console.log('🎵 Iniciando Sincronização da Rádio F PAC Sound...');
  console.log(`📁 Escaneando pasta "${STORAGE_FOLDER}" no Firebase Storage...`);

  try {
    // 1. Buscar faixas existentes no Firestore para evitar duplicatas
    const snapshot = await db.collection(MUSIC_COLLECTION).get();
    const existingUrls = new Set();
    const existingTitles = new Set();
    let maxOrder = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.audio) existingUrls.add(data.audio);
      if (data.title) existingTitles.add(data.title.toLowerCase().trim());
      if (data.order && data.order > maxOrder) maxOrder = data.order;
    });

    console.log(`ℹ️ Encontradas ${snapshot.size} faixas cadastradas no Firestore.`);

    // 2. Listar todos os arquivos do bucket dentro da pasta "Musicas do Site"
    // Buscamos em "Musicas do Site" diretamente e em subpastas como "audio"
    const [files] = await bucket.getFiles({ prefix: STORAGE_FOLDER });
    
    // Filtrar somente por arquivos de áudio
    const audioFiles = files.filter(file => {
      const lowerName = file.name.toLowerCase();
      return lowerName.endsWith('.mp3') || lowerName.endsWith('.wav') || lowerName.endsWith('.m4a');
    });

    if (audioFiles.length === 0) {
      console.log('⚠️ Nenhuma música (.mp3, .wav, .m4a) encontrada no Storage nessa pasta.');
      console.log(`Verifique se os arquivos estão dentro da pasta "${STORAGE_FOLDER}" no seu bucket.`);
      return;
    }

    console.log(`📂 Encontrados ${audioFiles.length} arquivos de áudio no Storage.`);

    let addedCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    for (const file of audioFiles) {
      const fileName = path.basename(file.name);
      
      try {
        // Gerar URL pública e persistente (download URL de mídia)
        // No Firebase Admin, geramos uma URL assinada ou uma URL pública permanente de mídia com token
        // O formato padrão do Firebase Storage para URL pública sem token de expiração (leitura pública):
        // https://firebasestorage.googleapis.com/v0/b/[BUCKET]/o/[PATH]?alt=media
        const encodedPath = encodeURIComponent(file.name);
        const audioUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;

        // Verifica se a URL já existe no banco
        if (existingUrls.has(audioUrl)) {
          existingCount++;
          continue;
        }

        // Extrai título e artista do nome do arquivo
        // Exemplo: "Drake - Hotline Bling.mp3"
        let title = fileName.substring(0, fileName.lastIndexOf('.'));
        let artist = 'F PAC Sound';
        let album = '';

        if (title.includes(' - ')) {
          const parts = title.split(' - ');
          artist = parts[0].trim();
          title = parts[1].trim();
        }

        // Evita duplicata por título
        if (existingTitles.has(title.toLowerCase().trim())) {
          existingCount++;
          continue;
        }

        // Determina ordem de reprodução
        maxOrder += 10;
        const trackId = db.collection(MUSIC_COLLECTION).doc().id;

        const newTrack = {
          id: trackId,
          title,
          artist,
          album,
          category: 'Geral',
          order: maxOrder,
          active: true,
          audio: audioUrl,
          cover: DEFAULT_COVER,
          duration: 180, // padrão de 3 min se a duração do metadado não for lida
          reproducoes: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection(MUSIC_COLLECTION).doc(trackId).set(newTrack);
        
        console.log(`✅ Adicionada com sucesso: "${artist} - ${title}"`);
        addedCount++;

        // Atualizar caches locais para evitar duplicatas em lote
        existingUrls.add(audioUrl);
        existingTitles.add(title.toLowerCase().trim());

      } catch (err) {
        console.error(`❌ Erro ao processar arquivo "${fileName}":`, err.message);
        errorCount++;
      }
    }

    console.log('\n----------------------------------------');
    console.log('🎉 Sincronização concluída!');
    console.log(`➕ Adicionadas ao Firestore: ${addedCount}`);
    console.log(`🔄 Já cadastradas anteriormente (ignoradas): ${existingCount}`);
    console.log(`❌ Erros no processo: ${errorCount}`);
    console.log('----------------------------------------\n');

  } catch (error) {
    console.error('❌ Erro geral de sincronização:', error);
  }
}

runSync();
