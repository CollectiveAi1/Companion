import React, { useRef, useEffect, useState, useCallback } from 'react';
import { PencilIcon } from './icons/PencilIcon';
import { EraserIcon } from './icons/EraserIcon';
import { SprayIcon } from './icons/SprayIcon';
import { StampIcon } from './icons/StampIcon';


interface DrawingCanvasProps {
  onClose: () => void;
  onSubmit: (imageDataUrl: string) => void;
}

const COLORS = ['#000000', '#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#FFFFFF'];
const BRUSH_SIZES = [4, 8, 16];
type Tool = 'brush' | 'eraser' | 'spray' | 'stamp';

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ onClose, onSubmit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1]);
  const [tool, setTool] = useState<Tool>('brush');
  const historyRef = useRef<ImageData[]>([]);

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (canvas && context) {
        historyRef.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
        if (historyRef.current.length > 20) {
            historyRef.current.shift();
        }
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const parent = canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }
    const context = canvas.getContext('2d');
    if (!context) return;

    context.scale(window.devicePixelRatio, window.devicePixelRatio);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    contextRef.current = context;
    
    // Set a white background initially
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);

    saveHistory();
  }, [saveHistory]);

  const getCoords = (event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { offsetX: 0, offsetY: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in event.nativeEvent && event.nativeEvent.touches.length > 0) {
      clientX = event.nativeEvent.touches[0].clientX;
      clientY = event.nativeEvent.touches[0].clientY;
    } else if ('clientX' in event.nativeEvent) {
       clientX = event.nativeEvent.clientX;
       clientY = event.nativeEvent.clientY;
    } else {
        return { offsetX: 0, offsetY: 0 };
    }
    return {
        offsetX: clientX - rect.left,
        offsetY: clientY - rect.top
    };
  };

  const drawSpray = useCallback((x: number, y: number) => {
      const context = contextRef.current;
      if (!context) return;
      const radius = brushSize;
      const density = 25 + brushSize;
      context.fillStyle = color;
      for (let i = 0; i < density; i++) {
          const angle = Math.random() * 2 * Math.PI;
          const r = Math.random() * radius;
          const dotX = x + r * Math.cos(angle);
          const dotY = y + r * Math.sin(angle);
          context.beginPath();
          context.arc(dotX, dotY, Math.random() * 1.5, 0, 2 * Math.PI);
          context.fill();
      }
  }, [brushSize, color]);

  const drawStamp = useCallback((x: number, y: number) => {
      const context = contextRef.current;
      if (!context) return;
      saveHistory();
      const size = brushSize * 3;
      context.fillStyle = color;

      context.beginPath();
      context.moveTo(x, y - size / 2);
      for (let i = 0; i < 5; i++) {
          context.lineTo(
              x + Math.cos((18 + i * 72) / 180 * Math.PI) * size / 2,
              y - Math.sin((18 + i * 72) / 180 * Math.PI) * size / 2
          );
          context.lineTo(
              x + Math.cos((54 + i * 72) / 180 * Math.PI) * size / 4,
              y - Math.sin((54 + i * 72) / 180 * Math.PI) * size / 4
          );
      }
      context.closePath();
      context.fill();
  }, [saveHistory, brushSize, color]);
  
  const startDrawing = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    const { offsetX, offsetY } = getCoords(event);
    const context = contextRef.current;
    if (!context) return;
    
    saveHistory();

    if (tool === 'stamp') {
        drawStamp(offsetX, offsetY);
        setIsDrawing(false);
    } else {
        context.beginPath();
        context.moveTo(offsetX, offsetY);
        if (tool === 'spray') { // Start spraying immediately on click
             drawSpray(offsetX, offsetY);
        }
        setIsDrawing(true);
    }
  }, [saveHistory, tool, drawStamp, drawSpray]);

  const finishDrawing = useCallback(() => {
    const context = contextRef.current;
    if (!context) return;
    context.closePath();
    setIsDrawing(false);
  }, []);

  const draw = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    event.preventDefault();
    const { offsetX, offsetY } = getCoords(event);
    const context = contextRef.current;
    if (!context) return;

    switch (tool) {
        case 'spray':
            drawSpray(offsetX, offsetY);
            break;
        case 'brush':
        case 'eraser':
            context.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color;
            context.lineWidth = brushSize;
            context.lineTo(offsetX, offsetY);
            context.stroke();
            break;
    }
  }, [isDrawing, color, brushSize, tool, drawSpray]);

  const handleUndo = () => {
    if (historyRef.current.length > 1) {
        historyRef.current.pop();
        const lastImageData = historyRef.current[historyRef.current.length - 1];
        if (lastImageData && contextRef.current) {
          contextRef.current.putImageData(lastImageData, 0, 0);
        }
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (canvas && context) {
        saveHistory();
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    if (canvas) {
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        onSubmit(imageDataUrl);
    }
  };

  const ToolButton = ({ toolName, children }: { toolName: Tool, children: React.ReactNode}) => (
    <button onClick={() => setTool(toolName)} className={`p-1.5 rounded-md transition-colors ${tool === toolName ? 'bg-blue-200' : 'hover:bg-gray-200'}`}>
        {children}
    </button>
  );

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-2 md:p-4">
        <div className="relative w-full h-full max-w-3xl max-h-[95%] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 p-2 bg-gray-100 border-b">
                {/* Left Controls */}
                <div className="flex items-center gap-2">
                    <button onClick={onClose} className="px-3 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 font-semibold">Close</button>
                    <div className="flex items-center gap-1 p-1 bg-white rounded-md border">
                        {/* Fix: Passed icon components as children to ToolButton to satisfy the required 'children' prop. */}
                        <ToolButton toolName="brush"><PencilIcon className="w-6 h-6" /></ToolButton>
                        <ToolButton toolName="eraser"><EraserIcon className="w-6 h-6" /></ToolButton>
                        <ToolButton toolName="spray"><SprayIcon className="w-6 h-6" /></ToolButton>
                        <ToolButton toolName="stamp"><StampIcon className="w-6 h-6" /></ToolButton>
                    </div>
                    <div className="flex items-center gap-2 p-1 bg-white rounded-md border">
                        {BRUSH_SIZES.map(size => (
                            <button key={size} onClick={() => setBrushSize(size)} className={`flex items-center justify-center rounded-full border-2 transition-colors ${brushSize === size ? 'bg-blue-200 border-blue-500' : 'bg-white border-gray-300'}`} style={{width: `${size+16}px`, height: `${size+16}px`}}>
                                <div className="bg-black rounded-full" style={{width: `${size}px`, height: `${size}px`}}></div>
                            </button>
                        ))}
                    </div>
                </div>

                 {/* Right Actions */}
                 <div className="flex items-center gap-2">
                     <button onClick={handleUndo} className="px-3 py-2 bg-gray-200 rounded-md hover:bg-gray-300 text-sm font-medium">Undo</button>
                     <button onClick={handleClear} className="px-3 py-2 bg-gray-200 rounded-md hover:bg-gray-300 text-sm font-medium">Clear</button>
                     <button onClick={handleSubmit} className="px-4 py-2 text-sm bg-green-500 text-white font-bold rounded-md hover:bg-green-600">Done!</button>
                 </div>

                 {/* Colors */}
                <div className="flex flex-wrap justify-center gap-1.5 p-1 bg-white rounded-md border w-full">
                    {COLORS.map(c => (
                        <button key={c} onClick={() => setColor(c)} style={{ backgroundColor: c }} className={`w-7 h-7 rounded-full border-2 transition-transform transform hover:scale-110 ${color === c ? 'border-blue-500 ring-2 ring-offset-1 ring-blue-500' : 'border-gray-300'}`}></button>
                    ))}
                </div>
            </div>
            <div className="flex-grow w-full h-full bg-white cursor-crosshair" onMouseLeave={finishDrawing}>
                <canvas
                    ref={canvasRef}
                    className="w-full h-full"
                    onMouseDown={startDrawing}
                    onMouseUp={finishDrawing}
                    onMouseMove={draw}
                    onTouchStart={startDrawing}
                    onTouchEnd={finishDrawing}
                    onTouchCancel={finishDrawing}
                    onTouchMove={draw}
                />
            </div>
        </div>
    </div>
  );
};

export default DrawingCanvas;