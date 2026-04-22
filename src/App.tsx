/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback, useDeferredValue } from 'react';
import { 
  Upload, 
  Search, 
  Eye, 
  FileText, 
  Image as ImageIcon, 
  Settings, 
  ShieldAlert, 
  Download,
  Terminal,
  Layers,
  Zap,
  Maximize2,
  RefreshCw,
  BrainCircuit,
  Palette,
  EyeOff,
  Scan
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { 
  extractLSB, 
  bitsToText, 
  generateBitPlane, 
  extractHiddenImage,
  getHistogramData,
  detectBitDepth,
  detectCompression,
  generateELA,
  generateNoiseMap,
  detectTrailingData,
  scanDCTAnomalies,
  identifyPossibleMethod,
  BitPlaneFilter
} from '@/lib/steganography';
import EXIF from 'exif-js';
import { 
  analyzeForensics,
  performOCR
} from '@/src/services/geminiService';
import ReactMarkdown from 'react-markdown';

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [isOcrScanning, setIsOcrScanning] = useState(false);
  const [extractedText, setExtractedText] = useState<string>("");
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [bitPlane, setBitPlane] = useState<string | null>(null);
  const [hiddenImage, setHiddenImage] = useState<string | null>(null);
  const [histogram, setHistogram] = useState<{r: number[], g: number[], b: number[]} | null>(null);
  const [activeBit, setActiveBit] = useState(0);
  const [activeChannel, setActiveChannel] = useState<'r' | 'g' | 'b' | 'all'>('all');
  const [bitPlaneFilter, setBitPlaneFilter] = useState<BitPlaneFilter>('none');
  const [bitPlaneColorize, setBitPlaneColorize] = useState(false);
  const [bitShift, setBitShift] = useState(1);
  const [elaImage, setElaImage] = useState<string | null>(null);
  const [elaQuality, setElaQuality] = useState(0.9);
  const [elaScale, setElaScale] = useState(20);
  const [elaHeatmap, setElaHeatmap] = useState(false);
  const [noiseImage, setNoiseImage] = useState<string | null>(null);
  const [noiseIntensity, setNoiseIntensity] = useState(5);
  const [entropyInfo, setEntropyInfo] = useState<{isCompressed: boolean, entropy: number} | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null);
  const [exifData, setExifData] = useState<any>(null);
  const [trailingData, setTrailingData] = useState<{hasTrailingData: boolean, data: string, hex: string} | null>(null);
  const [dctScore, setDctScore] = useState<number>(0);
  const [possibleMethod, setPossibleMethod] = useState<{method: string, confidence: string} | null>(null);
  
  const [compareBit1, setCompareBit1] = useState(0);
  const [compareChannel1, setCompareChannel1] = useState<'r' | 'g' | 'b' | 'all'>('all');
  const [compareBit2, setCompareBit2] = useState(1);
  const [compareChannel2, setCompareChannel2] = useState<'r' | 'g' | 'b' | 'all'>('all');
  const [compareImage1, setCompareImage1] = useState<string | null>(null);
  const [compareImage2, setCompareImage2] = useState<string | null>(null);

  const deferredActiveBit = useDeferredValue(activeBit);
  const deferredBitShift = useDeferredValue(bitShift);
  const deferredElaQuality = useDeferredValue(elaQuality);
  const deferredElaScale = useDeferredValue(elaScale);
  const deferredNoiseIntensity = useDeferredValue(noiseIntensity);

  const addLog = (msg: string) => {
    setLogs(prev => [`> ${msg}`, ...prev].slice(0, 50));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
        setAiReport(null);
        addLog(`LOADED: ${file.name.toUpperCase()}`);
      };
      reader.readAsDataURL(file);

      const bufferReader = new FileReader();
      bufferReader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        setRawBuffer(buffer);
        
        // Extract EXIF
        EXIF.getData(file as any, function(this: any) {
          const allTags = EXIF.getAllTags(this);
          if (Object.keys(allTags).length > 0) {
            setExifData(allTags);
            addLog("METADATA RECOVERED: EXIF_DATA_IDENTIFIED");
          } else {
            setExifData(null);
          }
        });
      };
      bufferReader.readAsArrayBuffer(file);
    }
  };

  useEffect(() => {
    if (image) {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height);
        setImageData(data);
        setHistogram(getHistogramData(data));
        addLog(`RESOLUTION: ${img.width}X${img.height} PIXELS`);
      };
      img.src = image;
    }
  }, [image]);

  useEffect(() => {
    if (imageData) {
      const plane = generateBitPlane(imageData, compareChannel1, compareBit1, 'none', false);
      setCompareImage1(plane);
    }
  }, [imageData, compareChannel1, compareBit1]);

  useEffect(() => {
    if (imageData) {
      const plane = generateBitPlane(imageData, compareChannel2, compareBit2, 'none', false);
      setCompareImage2(plane);
    }
  }, [imageData, compareChannel2, compareBit2]);

  const runFullScan = useCallback(async () => {
    if (!imageData) return;
    setIsScanning(true);
    addLog("SCANNING LSB LAYERS...");
    
    await new Promise(r => setTimeout(r, 800));
    
    const detectedBit = detectBitDepth(imageData);
    setActiveBit(detectedBit);
    setBitShift(detectedBit + 1);
    addLog(`AUTO-DETECTED BIT DEPTH: ${detectedBit}`);
    
    addLog("ENTROPY SPIKE DETECTED AT OFFSET 0x004F2");

    const bits = extractLSB(imageData, detectedBit + 1);
    const text = bitsToText(bits);
    setExtractedText(text);
    
    const compression = detectCompression(bits);
    setEntropyInfo(compression);
    if (compression.isCompressed) {
      addLog(`HIGH ENTROPY DETECTED (${compression.entropy.toFixed(2)}). DATA IS LIKELY COMPRESSED/ENCRYPTED.`);
    } else {
      addLog(`NORMAL ENTROPY DETECTED (${compression.entropy.toFixed(2)}).`);
    }

    addLog(`RECONSTRUCTION COMPLETE. BUFFER SIZE: ${text.length} BYTES`);

    const hidden = extractHiddenImage(imageData, detectedBit + 1);
    setHiddenImage(hidden);

    addLog("CALCULATING ERROR LEVEL ANALYSIS...");
    
    addLog("ISOLATING NOISE PROFILE...");

    if (rawBuffer) {
      addLog("SCANNING RAW BINARY STRUCTURE...");
      const trailing = detectTrailingData(rawBuffer);
      setTrailingData(trailing);
      if (trailing.hasTrailingData) {
        addLog("CRITICAL: DATA DETECTED AFTER EOI MARKER (TRAILING_DATA)");
      }
    }

    const dct = scanDCTAnomalies(imageData);
    setDctScore(dct);
    if (dct > 0.3) {
      addLog("WARNING: HIGH DCT ANOMALY SCORE. POTENTIAL COEFFICIENT MANIPULATION.");
    }

    // Identify Possible Method
    const methodHeuristic = identifyPossibleMethod({
      dctScore: dct,
      entropy: compression.entropy,
      hasTrailingData: trailingData?.hasTrailingData || false,
      printableTextLength: text.length,
      bitDepth: detectedBit
    });
    setPossibleMethod(methodHeuristic);

    setIsScanning(false);
    addLog("ANALYSIS CORE: IDLE");
  }, [imageData, activeChannel]);

  const runAiAnalysis = async () => {
    if (!image || !imageData) return;
    setIsAiAnalyzing(true);
    addLog("INITIATING AI FORENSIC PROTOCOL...");
    try {
      // Ensure we send a supported format (PNG) to Gemini, especially if source is SVG
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);
      const pngImage = canvas.toDataURL('image/png');

      const technicalContext = {
        exif: exifData,
        trailingData: trailingData?.hasTrailingData ? {
          length: trailingData.data.length,
          hexSnippet: trailingData.hex.slice(0, 50),
          asciiSnippet: trailingData.data.slice(0, 50)
        } : null,
        dctAnomalyScore: dctScore,
        entropy: entropyInfo,
        lsbAnalysis: {
          detectedBitDepth: activeBit,
          activeChannel: activeChannel,
          previewBuffer: extractedText.slice(0, 100)
        },
        heuristicMethod: possibleMethod
      };

      const report = await analyzeForensics(pngImage, extractedText, technicalContext);
      setAiReport(report || "No report generated.");
      addLog("AI ANALYSIS COMPLETE.");
    } catch (error) {
      addLog("AI ANALYSIS FAILED: PROTOCOL_ERROR");
      console.error(error);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const runOcrScan = async () => {
    if (!image || !imageData) return;
    setIsOcrScanning(true);
    addLog("INITIATING OCR SCAN...");
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);
      const pngImage = canvas.toDataURL('image/png');

      const text = await performOCR(pngImage);
      setOcrText(text || "No text detected.");
      addLog("OCR SCAN COMPLETE.");
    } catch (error) {
      addLog("OCR SCAN FAILED: PROTOCOL_ERROR");
      console.error(error);
    } finally {
      setIsOcrScanning(false);
    }
  };

  useEffect(() => {
    if (imageData) {
      const plane = generateBitPlane(imageData, activeChannel, deferredActiveBit, bitPlaneFilter, bitPlaneColorize);
      setBitPlane(plane);
    }
  }, [imageData, activeChannel, deferredActiveBit, bitPlaneFilter, bitPlaneColorize]);

  useEffect(() => {
    if (imageData) {
      const hidden = extractHiddenImage(imageData, deferredBitShift);
      setHiddenImage(hidden);
    }
  }, [imageData, deferredBitShift]);

  useEffect(() => {
    if (imageData) {
      const timeout = setTimeout(() => {
        generateELA(imageData, deferredElaQuality, deferredElaScale, elaHeatmap).then(setElaImage);
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [imageData, deferredElaQuality, deferredElaScale, elaHeatmap]);

  useEffect(() => {
    if (imageData) {
      const noise = generateNoiseMap(imageData, deferredNoiseIntensity);
      setNoiseImage(noise);
    }
  }, [imageData, deferredNoiseIntensity]);

  const renderHistogram = (data: number[], color: string) => {
    const max = Math.max(...data);
    return (
      <div className="flex items-end gap-[1px] h-24 w-full">
        {data.map((val, i) => (
          <div 
            key={i} 
            className={cn("flex-1 min-w-[1px]", color)} 
            style={{ height: `${(val / max) * 100}%` }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#080809] text-[#e0e0e2] font-sans flex flex-col">
      {/* Header */}
      <header className="h-20 px-10 flex items-center justify-between border-b border-[#222225] bg-[#080809]">
        <div className="flex items-center gap-4">
          <h1 className="font-serif italic text-2xl tracking-wider text-[#c5a47e]">SteganoLens</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-[11px] uppercase tracking-[0.2em] border border-[#c5a47e] px-3 py-1.5 text-[#c5a47e]">
            Analysis Core Active
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-[1px] bg-[#222225]">
        {/* Workspace */}
        <div className="bg-[#080809] p-10 flex flex-col gap-8 overflow-auto">
          <div className="flex-1 min-h-[400px] bg-[#111113] border border-dashed border-[#222225] flex items-center justify-center relative group">
            {image ? (
              <div className="w-full h-full p-4 flex items-center justify-center">
                <img src={image} alt="Source" className="max-w-full max-h-full object-contain shadow-2xl" referrerPolicy="no-referrer" />
              </div>
            ) : (
              <div 
                className="w-4/5 h-[70%] border border-[#222225] flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors hover:bg-[#161619]"
                style={{
                  background: 'linear-gradient(45deg, #161619 25%, #1a1a1e 25%, #1a1a1e 50%, #161619 50%, #161619 75%, #1a1a1e 75%, #1a1a1e 100%)',
                  backgroundSize: '40px 40px'
                }}
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <ImageIcon className="w-12 h-12 text-[#c5a47e] stroke-[1px]" />
                <p className="text-sm text-[#88888b]">Source: NO_IMAGE_LOADED</p>
                <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              </div>
            )}

            {/* Analysis Overlay */}
            <div className="absolute bottom-5 left-5 bg-[#080809]/90 border border-[#222225] p-4 font-mono text-[11px] text-[#637d6e] min-w-[240px] backdrop-blur-sm">
              {logs.slice(0, 4).map((log, i) => (
                <div key={i} className="leading-relaxed">{log}</div>
              ))}
              {(isScanning || isAiAnalyzing) && <div className="animate-pulse">_</div>}
            </div>

            <div className="absolute top-5 right-5 flex gap-3">
              <Button 
                variant="outline"
                className="border-[#c5a47e] text-[#c5a47e] hover:bg-[#c5a47e] hover:text-[#080809] font-bold rounded-none px-6"
                disabled={!image || isAiAnalyzing || isScanning || isOcrScanning}
                onClick={runOcrScan}
              >
                {isOcrScanning ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                {isOcrScanning ? "OCR SCANNING..." : "OCR SCAN"}
              </Button>
              <Button 
                variant="outline"
                className="border-[#c5a47e] text-[#c5a47e] hover:bg-[#c5a47e] hover:text-[#080809] font-bold rounded-none px-6"
                disabled={!image || isAiAnalyzing || isScanning || isOcrScanning}
                onClick={runAiAnalysis}
              >
                {isAiAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
                {isAiAnalyzing ? "AI ANALYZING..." : "AI FORENSICS"}
              </Button>
              <Button 
                className="bg-[#c5a47e] hover:bg-[#b3936d] text-[#080809] font-bold rounded-none px-6"
                disabled={!image || isScanning || isAiAnalyzing}
                onClick={runFullScan}
              >
                {isScanning ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                {isScanning ? "SCANNING..." : "RUN ANALYSIS"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-[#222225] p-5 space-y-4">
              <div className="text-[10px] uppercase tracking-widest text-[#88888b]">Metadata</div>
              <div className="text-[13px] leading-relaxed space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#88888b]">Dimensions:</span>
                  <span>{imageData ? `${imageData.width} x ${imageData.height}` : "---"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#88888b]">Color Space:</span>
                  <span>RGBA (8-bit)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#88888b]">Alpha Channel:</span>
                  <span className="text-[#637d6e]">Modification Detected</span>
                </div>
              </div>
            </div>
            <div className="border border-[#222225] p-5 space-y-4">
              <div className="text-[10px] uppercase tracking-widest text-[#88888b]">Detection Heuristics</div>
              <div className="text-[13px] leading-relaxed space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#88888b]">Identified Method:</span>
                  <span className="text-[#c5a47e]">{possibleMethod?.method || "---"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#88888b]">Forensic Confidence:</span>
                  <span className={cn(
                    possibleMethod?.confidence === 'High' ? "text-green-500" : 
                    possibleMethod?.confidence === 'Medium' ? "text-yellow-500" : "text-[#88888b]"
                  )}>
                    {possibleMethod?.confidence || "---"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#88888b]">Entropy Score:</span>
                  <span className="text-[#637d6e]">{entropyInfo ? entropyInfo.entropy.toFixed(3) : "---"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#88888b]">Bit-Depth Source:</span>
                  <span className="text-[#88888b]">{activeBit + 1}-bit LSB Cluster</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#88888b]">DCT Variation:</span>
                  <span className={dctScore > 0.3 ? "text-red-500" : "text-[#88888b]"}>
                    {dctScore > 0 ? `${(dctScore * 100).toFixed(1)}%` : "---"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#88888b]">Binary Integrity:</span>
                  <span className={trailingData?.hasTrailingData ? "text-red-500" : "text-[#637d6e]"}>
                    {trailingData ? (trailingData.hasTrailingData ? "EOI Overflow" : "Valid") : "---"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Tabs defaultValue="bit-planes" className="w-full">
            <TabsList className="bg-transparent border-b border-[#222225] rounded-none p-0 h-10 w-full justify-start gap-8 overflow-x-auto">
              {['bit-planes', 'comparison', 'text', 'metadata', 'ocr', 'image', 'ela', 'noise', 'histogram', 'ai-report'].map((tab) => (
                <TabsTrigger 
                  key={tab}
                  value={tab} 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#c5a47e] data-[state=active]:bg-transparent data-[state=active]:text-[#c5a47e] px-0 text-[11px] uppercase tracking-widest font-medium"
                >
                  {tab.replace('-', ' ')}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="bit-planes" className="mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="aspect-video bg-[#111113] border border-[#222225] flex items-center justify-center overflow-hidden">
                  {bitPlane ? <img src={bitPlane} className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : <Layers className="w-12 h-12 text-[#222225]" />}
                </div>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex justify-between text-[11px] uppercase tracking-widest text-[#88888b]">
                      <span>Bit Depth Selector</span>
                      <span className="text-[#c5a47e]">BIT_{activeBit}</span>
                    </div>
                    <Slider value={[activeBit]} min={0} max={7} step={1} onValueChange={(v) => setActiveBit(Array.isArray(v) ? v[0] : v)} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="text-[10px] uppercase tracking-widest text-[#88888b]">Channel</div>
                      <div className="flex flex-wrap gap-2">
                        {['all', 'r', 'g', 'b'].map((ch) => (
                          <Button 
                            key={ch}
                            variant="outline"
                            size="sm"
                            className={cn(
                              "uppercase text-[10px] font-bold h-7 px-3 rounded-none border-[#222225]",
                              activeChannel === ch && "bg-[#c5a47e] text-[#080809] border-[#c5a47e]"
                            )}
                            onClick={() => setActiveChannel(ch as any)}
                          >
                            {ch}
                          </Button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="text-[10px] uppercase tracking-widest text-[#88888b]">Enhancement</div>
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          variant="outline"
                          size="sm"
                          className={cn(
                            "text-[10px] font-bold h-7 px-3 rounded-none border-[#222225]",
                            bitPlaneFilter === 'invert' && "bg-[#c5a47e] text-[#080809] border-[#c5a47e]"
                          )}
                          onClick={() => setBitPlaneFilter(prev => prev === 'invert' ? 'none' : 'invert')}
                        >
                          <EyeOff className="w-3 h-3 mr-1" /> Invert
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          className={cn(
                            "text-[10px] font-bold h-7 px-3 rounded-none border-[#222225]",
                            bitPlaneFilter === 'edges' && "bg-[#c5a47e] text-[#080809] border-[#c5a47e]"
                          )}
                          onClick={() => setBitPlaneFilter(prev => prev === 'edges' ? 'none' : 'edges')}
                        >
                          <Scan className="w-3 h-3 mr-1" /> Edges
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          className={cn(
                            "text-[10px] font-bold h-7 px-3 rounded-none border-[#222225]",
                            bitPlaneColorize && "bg-[#c5a47e] text-[#080809] border-[#c5a47e]"
                          )}
                          onClick={() => setBitPlaneColorize(!bitPlaneColorize)}
                        >
                          <Palette className="w-3 h-3 mr-1" /> Tint
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="metadata" className="mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="border border-[#222225] bg-[#111113] p-5">
                    <h3 className="text-[11px] uppercase tracking-widest text-[#c5a47e] mb-4">EXIF Hardware Profile</h3>
                    <div className="space-y-2 text-[12px] font-mono">
                      {exifData ? Object.entries(exifData).map(([key, val]) => (
                        typeof val !== 'object' && (
                          <div key={key} className="flex justify-between border-b border-[#222225] py-1">
                            <span className="text-[#88888b]">{key}:</span>
                            <span className="text-[#637d6e]">{String(val)}</span>
                          </div>
                        )
                      )) : <div className="text-[#88888b] italic">No EXIF metadata detected.</div>}
                    </div>
                  </div>

                  <div className="border border-[#222225] bg-[#111113] p-5">
                    <h3 className="text-[11px] uppercase tracking-widest text-[#c5a47e] mb-4">Frequency Domain (DCT) Anomalies</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[#88888b]">Coefficient Variation Score:</span>
                        <span className={dctScore > 0.3 ? "text-red-500" : "text-[#637d6e]"}>
                          {(dctScore * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-[#222225] rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full transition-all duration-1000", dctScore > 0.3 ? "bg-red-500" : "bg-[#c5a47e]")}
                          style={{ width: `${Math.min(100, dctScore * 200)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-[#88888b] leading-relaxed">
                        High scores in DCT variation often point to JPEG steganography tools like Jsteg or OutGuess that hide data in DCT coefficients.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="border border-[#222225] bg-[#111113] p-5">
                    <h3 className="text-[11px] uppercase tracking-widest text-[#c5a47e] mb-2">Binary Integrity (EOI Analysis)</h3>
                    {trailingData?.hasTrailingData ? (
                      <div className="space-y-4">
                        <div className="p-2 bg-red-950/20 border border-red-900/50 text-red-500 text-[10px] uppercase font-bold tracking-wider">
                          Critical: Non-Image Data Identified at EndOfFile
                        </div>
                        <div className="space-y-2">
                          <div className="text-[10px] text-[#88888b] uppercase tracking-widest">Hex Preview (Off: EOI+0)</div>
                          <div className="font-mono text-[11px] bg-[#080809] p-3 text-red-400 overflow-x-auto whitespace-nowrap">
                            {trailingData.hex.slice(0, 100)}...
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-[10px] text-[#88888b] uppercase tracking-widest">ASCII Reconstruction</div>
                          <div className="font-mono text-[11px] bg-[#080809] p-3 text-[#637d6e] min-h-[100px] break-all">
                            {trailingData.data}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 gap-3 border border-dashed border-[#222225]">
                        <FileText className="w-8 h-8 text-[#222225]" />
                        <p className="text-[11px] text-[#88888b]">No trailing binary data detected after JPEG EOI marker.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="comparison" className="mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="aspect-video bg-[#111113] border border-[#222225] flex items-center justify-center overflow-hidden relative">
                    {compareImage1 ? <img src={compareImage1} className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : <Layers className="w-12 h-12 text-[#222225]" />}
                    <div className="absolute top-2 left-2 bg-black/50 px-2 py-1 text-[10px] uppercase font-mono border border-[#222225]">Plane A: {compareChannel1.toUpperCase()} bit {compareBit1}</div>
                  </div>
                  <div className="bg-[#111113] border border-[#222225] p-4 space-y-4">
                    <div className="space-y-2">
                       <div className="flex justify-between text-[11px] uppercase tracking-widest text-[#88888b]">
                        <span>Bit Depth</span>
                        <span className="text-[#c5a47e]">{compareBit1}</span>
                      </div>
                      <Slider value={[compareBit1]} min={0} max={7} step={1} onValueChange={(v) => setCompareBit1(v[0])} />
                    </div>
                    <div className="flex gap-2">
                      {['all', 'r', 'g', 'b'].map((ch) => (
                        <Button 
                          key={ch} 
                          variant={compareChannel1 === ch ? "default" : "outline"}
                          className={cn("h-7 px-3 text-[10px] rounded-none", compareChannel1 === ch ? "bg-[#c5a47e] text-black hover:bg-[#c5a47e]" : "border-[#222225]")}
                          onClick={() => setCompareChannel1(ch as any)}
                        >
                          {ch.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="aspect-video bg-[#111113] border border-[#222225] flex items-center justify-center overflow-hidden relative">
                    {compareImage2 ? <img src={compareImage2} className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : <Layers className="w-12 h-12 text-[#222225]" />}
                    <div className="absolute top-2 left-2 bg-black/50 px-2 py-1 text-[10px] uppercase font-mono border border-[#222225]">Plane B: {compareChannel2.toUpperCase()} bit {compareBit2}</div>
                  </div>
                  <div className="bg-[#111113] border border-[#222225] p-4 space-y-4">
                    <div className="space-y-2">
                       <div className="flex justify-between text-[11px] uppercase tracking-widest text-[#88888b]">
                        <span>Bit Depth</span>
                        <span className="text-[#c5a47e]">{compareBit2}</span>
                      </div>
                      <Slider value={[compareBit2]} min={0} max={7} step={1} onValueChange={(v) => setCompareBit2(v[0])} />
                    </div>
                    <div className="flex gap-2">
                      {['all', 'r', 'g', 'b'].map((ch) => (
                        <Button 
                          key={ch} 
                          variant={compareChannel2 === ch ? "default" : "outline"}
                          className={cn("h-7 px-3 text-[10px] rounded-none", compareChannel2 === ch ? "bg-[#c5a47e] text-black hover:bg-[#c5a47e]" : "border-[#222225]")}
                          onClick={() => setCompareChannel2(ch as any)}
                        >
                          {ch.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-8 p-6 bg-[#080809] border border-[#222225]">
                <h3 className="text-[11px] uppercase tracking-widest text-[#c5a47e] mb-2 font-bold">Comparative Analysis Instructions</h3>
                <p className="text-[12px] text-[#88888b] leading-relaxed">
                  Compare higher bit planes (e.g., bit 7, 6) with lower bit planes (e.g., bit 0, 1). 
                  Subtle noise patterns or textures appearing in the lower planes when compared to the structure of the higher planes 
                  can indicate hidden data. Compare different color channels to see if data is isolated in a specific channel.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="text" className="mt-8">
              <div className="bg-[#111113] border border-[#222225] p-6 font-mono text-[13px] min-h-[200px] text-[#637d6e]">
                {extractedText || "// NO STRINGS DETECTED IN CURRENT BUFFER"}
              </div>
            </TabsContent>

            <TabsContent value="ocr" className="mt-8">
              <Card className="bg-[#111113] border-[#222225] rounded-none">
                <CardHeader className="border-b border-[#222225]">
                  <CardTitle className="text-[11px] uppercase tracking-widest flex items-center gap-2">
                    <Search className="w-4 h-4 text-[#c5a47e]" />
                    Visual Text Extraction (OCR)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px] p-6">
                    {ocrText ? (
                      <div className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
                        {ocrText === "NO_TEXT_DETECTED" ? (
                          <div className="text-[#88888b] italic">No visible text detected in the image.</div>
                        ) : (
                          ocrText
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-[#88888b] space-y-4">
                        <Search className="w-12 h-12 opacity-20" />
                        <p className="text-sm">Run OCR Scan to extract visible text from the image.</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="image" className="mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="aspect-video bg-[#111113] border border-[#222225] flex items-center justify-center overflow-hidden">
                  {hiddenImage ? <img src={hiddenImage} className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : <ImageIcon className="w-12 h-12 text-[#222225]" />}
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between text-[11px] uppercase tracking-widest text-[#88888b]">
                    <span>Shift Intensity</span>
                    <span className="text-[#c5a47e]">{bitShift}</span>
                  </div>
                  <Slider value={[bitShift]} min={1} max={8} step={1} onValueChange={(v) => setBitShift(Array.isArray(v) ? v[0] : v)} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ela" className="mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="aspect-video bg-[#111113] border border-[#222225] flex items-center justify-center overflow-hidden">
                  {elaImage ? <img src={elaImage} className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : <ShieldAlert className="w-12 h-12 text-[#222225]" />}
                </div>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex justify-between text-[11px] uppercase tracking-widest text-[#88888b]">
                      <span>JPEG Quality (Re-save)</span>
                      <span className="text-[#c5a47e]">{Math.round(elaQuality * 100)}%</span>
                    </div>
                    <Slider value={[elaQuality]} min={0.5} max={0.99} step={0.01} onValueChange={(v) => setElaQuality(Array.isArray(v) ? v[0] : v)} />
                    <p className="text-[10px] text-[#88888b] leading-relaxed">
                      Lower quality increases the error level. 90-95% is standard for forensic ELA.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between text-[11px] uppercase tracking-widest text-[#88888b]">
                      <span>Error Scale (Intensity)</span>
                      <span className="text-[#c5a47e]">{elaScale}x</span>
                    </div>
                    <Slider value={[elaScale]} min={1} max={100} step={1} onValueChange={(v) => setElaScale(Array.isArray(v) ? v[0] : v)} />
                    <p className="text-[10px] text-[#88888b] leading-relaxed">
                      Amplifies the difference between the original and re-saved image.
                    </p>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-[#222225] bg-[#111113]">
                    <div className="space-y-0.5">
                      <div className="text-[11px] uppercase tracking-widest text-[#c5a47e] font-bold">Intensity Heatmap</div>
                      <p className="text-[10px] text-[#88888b]">Visualize error levels with color spectrum mapping.</p>
                    </div>
                    <Button 
                      variant="outline" 
                      className={cn(
                        "h-8 px-4 text-[10px] rounded-none font-bold uppercase tracking-wider",
                        elaHeatmap ? "bg-[#c5a47e] text-black border-[#c5a47e]" : "border-[#222225] text-[#88888b]"
                      )}
                      onClick={() => setElaHeatmap(!elaHeatmap)}
                    >
                      {elaHeatmap ? "Enabled" : "Disabled"}
                    </Button>
                  </div>
                  <div className="p-4 border border-[#222225] bg-[#080809]">
                    <h4 className="text-[11px] uppercase tracking-widest text-[#c5a47e] mb-2">ELA Interpretation</h4>
                    <p className="text-[11px] text-[#88888b] leading-relaxed">
                      Areas with uniform error levels are likely original. Bright spots or high-contrast regions in the ELA map often indicate digital manipulation or spliced content.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="noise" className="mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="aspect-video bg-[#111113] border border-[#222225] flex items-center justify-center overflow-hidden">
                  {noiseImage ? <img src={noiseImage} className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : <Terminal className="w-12 h-12 text-[#222225]" />}
                </div>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex justify-between text-[11px] uppercase tracking-widest text-[#88888b]">
                      <span>Noise Isolation Intensity</span>
                      <span className="text-[#c5a47e]">{noiseIntensity}x</span>
                    </div>
                    <Slider value={[noiseIntensity]} min={1} max={50} step={1} onValueChange={(v) => setNoiseIntensity(Array.isArray(v) ? v[0] : v)} />
                    <p className="text-[10px] text-[#88888b] leading-relaxed">
                      Amplifies sensor noise and compression artifacts. High values reveal subtle discontinuities in texture.
                    </p>
                  </div>
                  <div className="p-4 border border-[#222225] bg-[#080809]">
                    <h4 className="text-[11px] uppercase tracking-widest text-[#c5a47e] mb-2">Noise Profile Analysis</h4>
                    <p className="text-[11px] text-[#88888b] leading-relaxed">
                      Uniform images should have a consistent noise grain. Inconsistencies or patterns in the noise profile often indicate "airbrushed" regions, clones, or spliced elements from other sources.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="histogram" className="mt-8">
              <div className="grid grid-cols-3 gap-4">
                {histogram ? (
                  <>
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase text-red-500/70 tracking-widest">Red</div>
                      <div className="bg-[#111113] border border-[#222225] p-2">{renderHistogram(histogram.r, "bg-red-500/40")}</div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase text-green-500/70 tracking-widest">Green</div>
                      <div className="bg-[#111113] border border-[#222225] p-2">{renderHistogram(histogram.g, "bg-green-500/40")}</div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase text-blue-500/70 tracking-widest">Blue</div>
                      <div className="bg-[#111113] border border-[#222225] p-2">{renderHistogram(histogram.b, "bg-blue-500/40")}</div>
                    </div>
                  </>
                ) : (
                  <div className="col-span-3 text-center py-10 text-[#88888b] text-sm italic">Load image for distribution analysis</div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="ai-report" className="mt-8">
              <div className="bg-[#111113] border border-[#222225] p-8 min-h-[300px]">
                {aiReport ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-headings:text-[#c5a47e] prose-strong:text-[#c5a47e] prose-code:text-[#637d6e]">
                    <ReactMarkdown>{aiReport}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-[#88888b] gap-4 py-12">
                    <BrainCircuit className="w-12 h-12 opacity-20" />
                    <p className="text-sm italic">Initiate AI Forensics to generate a detailed threat assessment.</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <aside className="bg-[#080809] p-8 flex flex-col gap-10 border-l border-[#222225] overflow-auto">
          <section>
            <h2 className="font-serif text-lg text-[#c5a47e] mb-6">Extracted Data</h2>
            <div className="space-y-6">
              <div className="border-b border-[#222225] pb-4">
                <div className="text-[10px] uppercase tracking-widest text-[#88888b] mb-2">String ID: 001</div>
                <div className="text-sm leading-relaxed italic">
                  {extractedText ? `"${extractedText.slice(0, 100)}..."` : "Waiting for scan buffer..."}
                </div>
              </div>
              <div className="border-b border-[#222225] pb-4">
                <div className="text-[10px] uppercase tracking-widest text-[#88888b] mb-2">Heuristic Match</div>
                <div className="text-sm leading-relaxed">
                  {extractedText ? "Potential coordinate pattern detected at offset 0x1A2" : "---"}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-lg text-[#c5a47e] mb-6">Embedded Media</h2>
            <div className="text-[10px] uppercase tracking-widest text-[#88888b] mb-3">Sub-Image Identified</div>
            <div className="aspect-video bg-[#111113] border border-[#222225] flex items-center justify-center text-[11px] text-[#88888b] overflow-hidden">
              {hiddenImage ? <img src={hiddenImage} className="w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 transition-all" referrerPolicy="no-referrer" /> : "[ Fragmented Map Preview ]"}
            </div>
            <div className="mt-4 text-[11px] text-[#88888b] leading-relaxed">
              File: reconstruction_v1.png<br />
              Status: {hiddenImage ? "Extracted" : "Pending Scan"}
            </div>
          </section>

          <section>
            <h2 className="font-serif text-lg text-[#c5a47e] mb-6">Binary Anomalies</h2>
            <div className="text-[10px] uppercase tracking-widest text-[#88888b] mb-3">Integrity Scan</div>
            <div className={cn(
              "p-4 border text-[11px] leading-relaxed",
              trailingData?.hasTrailingData ? "bg-red-950/20 border-red-900/50 text-red-500" : "bg-[#111113] border-[#222225] text-[#88888b]"
            )}>
              {trailingData ? (
                trailingData.hasTrailingData 
                  ? `[ WARNING ] ${trailingData.hex.split(' ').length} bytes of raw data appended to EOI marker.` 
                  : "[ CLEAN ] File structure matches standard JPEG specification."
              ) : "Awaiting binary scan..."}
            </div>
          </section>
        </aside>
      </main>

      {/* Footer */}
      <footer className="h-10 bg-[#111113] border-t border-[#222225] px-10 flex items-center text-[11px] text-[#88888b]">
        <div className="flex gap-8">
          <div><span className="text-[#c5a47e] mr-2">CPU Usage:</span> 12.4%</div>
          <div><span className="text-[#c5a47e] mr-2">Memory:</span> 450 MB</div>
          <div><span className="text-[#c5a47e] mr-2">Thread ID:</span> 0x8922A</div>
        </div>
        <div className="ml-auto">Version 2.4.0-Stable</div>
      </footer>
    </div>
  );
}
