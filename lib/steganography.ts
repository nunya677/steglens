/**
 * Steganography Logic Utilities
 */

export interface ScanResult {
  text: string;
  bitPlanes: string[]; // Data URLs of bit plane visualizations
  hiddenImage?: string; // Data URL of extracted hidden image
}

export const extractLSB = (imageData: ImageData, bitDepth: number = 1): Uint8Array => {
  const data = imageData.data;
  const bits = new Uint8Array(Math.ceil((data.length * 3 * bitDepth) / 8));
  let bitPos = 0;

  // We usually only hide in RGB, not Alpha
  for (let i = 0; i < data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const val = data[i + channel];
      for (let b = 0; b < bitDepth; b++) {
        const bit = (val >> b) & 1;
        const byteIdx = Math.floor(bitPos / 8);
        const bitIdx = bitPos % 8;
        if (bit) {
          bits[byteIdx] |= (1 << (7 - bitIdx));
        }
        bitPos++;
      }
    }
  }
  return bits;
};

export const bitsToText = (bytes: Uint8Array): string => {
  let text = "";
  for (let i = 0; i < bytes.length; i++) {
    const charCode = bytes[i];
    // Only include printable ASCII or common whitespace
    if ((charCode >= 32 && charCode <= 126) || charCode === 10 || charCode === 13 || charCode === 9) {
      text += String.fromCharCode(charCode);
    } else if (text.length > 0 && text[text.length - 1] !== '') {
      // Use a placeholder for non-printable to show gaps, but don't spam it
      // text += ""; 
    }
  }
  return text;
};

export type BitPlaneFilter = 'none' | 'invert' | 'edges';

export const generateBitPlane = (
  imageData: ImageData, 
  channel: 'r' | 'g' | 'b' | 'all', 
  bit: number,
  filter: BitPlaneFilter = 'none',
  colorize: boolean = false
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  const newImageData = ctx.createImageData(imageData.width, imageData.height);
  
  const accentColor = { r: 197, g: 164, b: 126 }; // #c5a47e

  for (let i = 0; i < imageData.data.length; i += 4) {
    let bitVal = 0;
    if (channel === 'all') {
      const r = (imageData.data[i] >> bit) & 1;
      const g = (imageData.data[i + 1] >> bit) & 1;
      const b = (imageData.data[i + 2] >> bit) & 1;
      bitVal = (r || g || b) ? 1 : 0;
    } else {
      const cIdx = channel === 'r' ? 0 : channel === 'g' ? 1 : 2;
      bitVal = (imageData.data[i + cIdx] >> bit) & 1;
    }

    if (filter === 'invert') {
      bitVal = bitVal ? 0 : 1;
    }

    const intensity = bitVal ? 255 : 0;
    
    if (colorize && bitVal) {
      newImageData.data[i] = accentColor.r;
      newImageData.data[i + 1] = accentColor.g;
      newImageData.data[i + 2] = accentColor.b;
    } else {
      newImageData.data[i] = intensity;
      newImageData.data[i + 1] = intensity;
      newImageData.data[i + 2] = intensity;
    }
    newImageData.data[i + 3] = 255;
  }

  if (filter === 'edges') {
    // Simple edge detection (Sobel-like) on the binary data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(newImageData, 0, 0);
    
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.filter = 'contrast(200%) brightness(150%) blur(0.5px)'; // Pre-process for edges
    ctx.drawImage(tempCanvas, 0, 0);
    
    // Apply a simple edge effect using canvas filters if possible, 
    // but for true forensic edge detection we'd do a kernel pass.
    // Let's use a simpler approach: Difference of Gaussians or just high contrast.
    ctx.filter = 'invert(100%) grayscale(100%) contrast(1000%)';
  } else {
    ctx.putImageData(newImageData, 0, 0);
  }
  
  return canvas.toDataURL();
};

export const extractHiddenImage = (imageData: ImageData, bitShift: number): string => {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  const newImageData = ctx.createImageData(imageData.width, imageData.height);
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    // Shift the lower bits to the upper bits to make them visible
    newImageData.data[i] = (imageData.data[i] << (8 - bitShift)) & 0xFF;
    newImageData.data[i + 1] = (imageData.data[i + 1] << (8 - bitShift)) & 0xFF;
    newImageData.data[i + 2] = (imageData.data[i + 2] << (8 - bitShift)) & 0xFF;
    newImageData.data[i + 3] = 255;
  }
  
  ctx.putImageData(newImageData, 0, 0);
  return canvas.toDataURL();
};

export const getHistogramData = (imageData: ImageData) => {
  const r = new Array(256).fill(0);
  const g = new Array(256).fill(0);
  const b = new Array(256).fill(0);
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    r[imageData.data[i]]++;
    g[imageData.data[i + 1]]++;
    b[imageData.data[i + 2]]++;
  }
  
  return { r, g, b };
};

export const calculateEntropy = (data: Uint8Array): number => {
  if (data.length === 0) return 0;
  const freq = new Array(256).fill(0);
  for (const byte of data) {
    freq[byte]++;
  }
  
  let entropy = 0;
  for (const f of freq) {
    if (f > 0) {
      const p = f / data.length;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
};

export const detectCompression = (data: Uint8Array): { isCompressed: boolean, entropy: number } => {
  const entropy = calculateEntropy(data);
  // Theoretical max entropy for 8-bit data is 8.0.
  // Compressed or encrypted data typically has entropy > 7.5.
  return {
    isCompressed: entropy > 7.5,
    entropy
  };
};

export const detectBitDepth = (imageData: ImageData): number => {
  let bestBit = 0;
  let maxPrintable = 0;

  // Scan bits 0 to 3 (most common for LSB)
  for (let bit = 0; bit < 4; bit++) {
    const bytes = extractLSB(imageData, bit + 1);
    let printableCount = 0;
    
    // Check first 1000 bytes for printable ASCII
    const sampleSize = Math.min(bytes.length, 1000);
    for (let i = 0; i < sampleSize; i++) {
      const charCode = bytes[i];
      if ((charCode >= 32 && charCode <= 126) || charCode === 10 || charCode === 13) {
        printableCount++;
      }
    }

    if (printableCount > maxPrintable) {
      maxPrintable = printableCount;
      bestBit = bit;
    }
  }

  return bestBit;
};

export const generateELA = async (
  imageData: ImageData, 
  quality: number = 0.9, 
  scale: number = 20,
  useHeatmap: boolean = false
): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);

    // Step 1: Export to JPEG at specified quality
    const jpegUrl = canvas.toDataURL('image/jpeg', quality);
    
    // Step 2: Load JPEG back
    const img = new Image();
    img.onload = () => {
      const jpegCanvas = document.createElement('canvas');
      jpegCanvas.width = imageData.width;
      jpegCanvas.height = imageData.height;
      const jpegCtx = jpegCanvas.getContext('2d')!;
      jpegCtx.drawImage(img, 0, 0);
      
      const jpegData = jpegCtx.getImageData(0, 0, imageData.width, imageData.height);
      const elaData = ctx.createImageData(imageData.width, imageData.height);
      
      // Step 3: Calculate difference
      for (let i = 0; i < imageData.data.length; i += 4) {
        // Calculate average difference across channels
        const dR = Math.abs(imageData.data[i] - jpegData.data[i]);
        const dG = Math.abs(imageData.data[i+1] - jpegData.data[i+1]);
        const dB = Math.abs(imageData.data[i+2] - jpegData.data[i+2]);
        
        if (useHeatmap) {
          // Average difference scaled 0-1
          const avgDiff = ((dR + dG + dB) / 3) * (scale / 40); // Normalizing slightly for heatmap visibility
          const n = Math.min(1, avgDiff / 25.5); // Sensitivity threshold
          
          // Jet-like color map: Blue (low) -> Cyan -> Green -> Yellow -> Red (high)
          if (n < 0.25) { // Blue to Cyan
             const f = n / 0.25;
             elaData.data[i] = 0;
             elaData.data[i+1] = Math.round(255 * f);
             elaData.data[i+2] = 255;
          } else if (n < 0.5) { // Cyan to Green
             const f = (n - 0.25) / 0.25;
             elaData.data[i] = 0;
             elaData.data[i+1] = 255;
             elaData.data[i+2] = Math.round(255 * (1 - f));
          } else if (n < 0.75) { // Green to Yellow
             const f = (n - 0.5) / 0.25;
             elaData.data[i] = Math.round(255 * f);
             elaData.data[i+1] = 255;
             elaData.data[i+2] = 0;
          } else { // Yellow to Red
             const f = (n - 0.75) / 0.25;
             elaData.data[i] = 255;
             elaData.data[i+1] = Math.round(255 * (1 - f));
             elaData.data[i+2] = 0;
          }
        } else {
          const diffR = dR * scale;
          const diffG = dG * scale;
          const diffB = dB * scale;
          
          elaData.data[i] = Math.min(255, diffR);
          elaData.data[i+1] = Math.min(255, diffG);
          elaData.data[i+2] = Math.min(255, diffB);
        }
        elaData.data[i+3] = 255;
      }
      
      const resultCanvas = document.createElement('canvas');
      resultCanvas.width = imageData.width;
      resultCanvas.height = imageData.height;
      resultCanvas.getContext('2d')!.putImageData(elaData, 0, 0);
      resolve(resultCanvas.toDataURL());
    };
    img.src = jpegUrl;
  });
};

export const generateNoiseMap = (imageData: ImageData, scale: number = 5): string => {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  const newImageData = ctx.createImageData(imageData.width, imageData.height);

  const data = imageData.data;
  const target = newImageData.data;
  const w = imageData.width;
  const h = imageData.height;

  // Simple High-Pass Filter using cross-kernel for noise extraction
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = data[i + c] * 4;
        const neighbors = 
          data[i - 4 + c] + 
          data[i + 4 + c] + 
          data[((y - 1) * w + x) * 4 + c] + 
          data[((y + 1) * w + x) * 4 + c];
        
        const diff = Math.abs(center - neighbors);
        target[i + c] = Math.min(255, diff * scale);
      }
      target[i + 3] = 255;
    }
  }

  ctx.putImageData(newImageData, 0, 0);
  return canvas.toDataURL();
};

export const detectTrailingData = (buffer: ArrayBuffer): { hasTrailingData: boolean, data: string, hex: string } => {
  const bytes = new Uint8Array(buffer);
  let eoiPos = -1;

  // Search for JPEG EOI marker (FF D9)
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD9) {
      eoiPos = i + 2;
      break;
    }
  }

  if (eoiPos === -1 || eoiPos >= bytes.length) {
    return { hasTrailingData: false, data: "", hex: "" };
  }

  const trailing = bytes.slice(eoiPos);
  if (trailing.length === 0) {
    return { hasTrailingData: false, data: "", hex: "" };
  }

  let text = "";
  let hex = "";
  for (let i = 0; i < Math.min(trailing.length, 1000); i++) {
    const b = trailing[i];
    if ((b >= 32 && b <= 126) || b === 10 || b === 13) {
      text += String.fromCharCode(b);
    } else {
      text += ".";
    }
    hex += b.toString(16).padStart(2, '0') + " ";
  }

  return {
    hasTrailingData: true,
    data: text,
    hex: hex.trim()
  };
};

export const scanDCTAnomalies = (imageData: ImageData): number => {
  const data = imageData.data;
  let score = 0;
  
  for (let y = 8; y < imageData.height - 8; y += 8) {
    for (let x = 8; x < imageData.width - 8; x += 8) {
      const idx = (y * imageData.width + x) * 4;
      const prevIdx = ((y - 1) * imageData.width + x) * 4;
      const nextIdx = ((y + 1) * imageData.width + x) * 4;
      
      const diff = Math.abs(data[idx] - data[prevIdx]) + Math.abs(data[idx] - data[nextIdx]);
      if (diff > 30) score++;
    }
  }
  const totalBlocks = (imageData.width / 8) * (imageData.height / 8);
  return totalBlocks > 0 ? score / totalBlocks : 0;
};

export const identifyPossibleMethod = (params: {
  dctScore: number,
  entropy: number,
  hasTrailingData: boolean,
  printableTextLength: number,
  bitDepth: number,
  mimeType?: string
}): { method: string, confidence: 'Low' | 'Medium' | 'High' } => {
  const { dctScore, entropy, hasTrailingData, printableTextLength, bitDepth, mimeType } = params;

  if (hasTrailingData) {
    return { method: "EOI Append (Concatenation)", confidence: "High" };
  }

  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    if (dctScore > 0.4) {
      return { method: "Jsteg / OutGuess (DCT Manipulation)", confidence: "High" };
    }
    if (dctScore > 0.2) {
      return { method: "Suspected F5 / Jsteg", confidence: "Medium" };
    }
  }

  if (printableTextLength > 50) {
    return { method: `LSB Insertion (BitDepth: ${bitDepth + 1})`, confidence: "High" };
  }

  if (entropy > 7.8) {
    return { method: "Suspected Steghide / Encrypted LSB", confidence: "Medium" };
  }

  if (entropy > 7.4) {
    return { method: "Possible LSB (High Entropy)", confidence: "Low" };
  }

  return { method: "None Detected", confidence: "Low" };
};
