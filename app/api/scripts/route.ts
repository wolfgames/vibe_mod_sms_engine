import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

async function scanDirectoryRecursively(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const items = await readdir(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        // Skip the archived directory
        if (item === 'archived') {
          continue;
        }
        // Recursively scan subdirectories
        const subFiles = await scanDirectoryRecursively(fullPath);
        files.push(...subFiles);
      } else if (item.endsWith('.twee')) {
        // Add .twee files to the list
        files.push(item);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error);
  }
  
  return files;
}

export async function GET() {
  try {
    // Path to the scripts directory
    const scriptsDir = join(process.cwd(), 'public', 'scripts');
    
    // Recursively scan for .twee files
    const tweeFiles = await scanDirectoryRecursively(scriptsDir);
    
    // Return the list of scripts
    return NextResponse.json(tweeFiles);
  } catch (error) {
    console.error('Error scanning scripts directory:', error);
    
    // Return empty array if there's an error
    return NextResponse.json([]);
  }
} 