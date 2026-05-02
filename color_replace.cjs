const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.css') || file.endsWith('.html')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src').concat(['./index.html']);
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/#00d4ff/g, '#eab308'); // cyan to gold
  content = content.replace(/#0a0a0f/g, '#ffffff'); // black to white
  content = content.replace(/#050508/g, '#f9fafb'); // dark gray to light gray
  
  content = content.replace(/text-white\/30/g, 'text-black/30');
  content = content.replace(/text-white\/40/g, 'text-black/40');
  content = content.replace(/text-white\/50/g, 'text-black/50');
  content = content.replace(/text-white\/60/g, 'text-black/60');
  content = content.replace(/text-white\/70/g, 'text-black/70');
  content = content.replace(/text-white\/80/g, 'text-black/80');
  
  content = content.replace(/text-white/g, 'text-black');
  content = content.replace(/text-gray-200/g, 'text-gray-800');
  content = content.replace(/text-gray-300/g, 'text-gray-700'); 
  content = content.replace(/text-gray-400/g, 'text-gray-600');
  
  content = content.replace(/bg-white\/5/g, 'bg-black/5');
  content = content.replace(/bg-white\/10/g, 'bg-black/10');
  content = content.replace(/bg-white\/20/g, 'bg-black/20');
  
  content = content.replace(/border-white\/5/g, 'border-black/5');
  content = content.replace(/border-white\/10/g, 'border-black/10');
  content = content.replace(/border-white\/20/g, 'border-black/20');
  content = content.replace(/border-white\/30/g, 'border-black/30');
  content = content.replace(/border-white\/50/g, 'border-black/50');
  
  content = content.replace(/border-white/g, 'border-black');

  // Specific gradients
  content = content.replace(/from-\[#ffffff\]/g, 'from-white'); // Fix in case it was #0a0a0f previously changed in same pass? No, just match #ffffff if needed, wait it was from-[#0a0a0f]
  
  content = content.replace(/bg-black\/20 opacity-0 group-hover:opacity-100/g, 'bg-white/20 opacity-0 group-hover:opacity-100'); 

  fs.writeFileSync(file, content);
});
console.log('Colors replaced');
