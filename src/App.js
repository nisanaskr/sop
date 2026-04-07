import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Edit,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  Lock,
  PlayCircle,
  Trash2,
  Video,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { QRCodeSVG } from 'qrcode.react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bmulnovloaztpdffyvdu.supabase.co';
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtdWxub3Zsb2F6dHBkZmZ5dmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDQyMTksImV4cCI6MjA5MTEyMDIxOX0.j3SaREkFH_6G8eFZGRE6gA6To79ZI6hUI4g1iXWvkKA';
const supabase = createClient(supabaseUrl, supabaseKey);

const TABLE_NAME = 'sops';
const STORAGE_BUCKET = 'sop-images';
const AUTH_STORAGE_KEY = 'visionguide_engineer_auth';

const createEmptyImageSlot = () => ({
  imageUrl: '',
  markers: [],
});

const createEmptyForm = () => ({
  title: '',
  steps: [''],
  warnings: [''],
  videoUrl: '',
  imageSlots: [createEmptyImageSlot(), createEmptyImageSlot()],
});

const getFileExtension = (fileName = '') => {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : 'jpg';
};

const extractStoragePath = (publicUrl) => {
  if (!publicUrl) return null;

  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);

  if (idx === -1) return null;

  return publicUrl.slice(idx + marker.length);
};

const normalizeSop = (row) => ({
  id: row.id,
  title: row.title || '',
  steps: Array.isArray(row.steps) && row.steps.length > 0 ? row.steps : [''],
  warnings: Array.isArray(row.warnings) && row.warnings.length > 0 ? row.warnings : [''],
  videoUrl: row.video_url || '',
  imageSlots: [
    {
      imageUrl: row.image_url_1 || row.image_url || '',
      markers: Array.isArray(row.markers_1) ? row.markers_1 : Array.isArray(row.markers) ? row.markers : [],
    },
    {
      imageUrl: row.image_url_2 || '',
      markers: Array.isArray(row.markers_2) ? row.markers_2 : [],
    },
  ],
});

const mapFormToRow = (form, id) => ({
  id,
  title: form.title,
  steps: form.steps,
  warnings: form.warnings,
  video_url: form.videoUrl,
  image_url_1: form.imageSlots[0].imageUrl,
  image_url_2: form.imageSlots[1].imageUrl,
  markers_1: form.imageSlots[0].markers,
  markers_2: form.imageSlots[1].markers,
});

const App = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const viewMode = queryParams.get('view');
  const targetId = queryParams.get('id');

  const fileInputRefs = [useRef(null), useRef(null)];
  const imageContainerRefs = [useRef(null), useRef(null)];
  const downloadRef = useRef(null);

  const buildOperatorUrl = (sopId) => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'operator');
    url.searchParams.set('id', sopId);
    return url.toString();
  };

  const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem(AUTH_STORAGE_KEY) === 'true');
  const [engineerPassword] = useState(localStorage.getItem('visionguide_pass') || '1234');
  const [accessKey, setAccessKey] = useState('');
  const [library, setLibrary] = useState([]);
  const [isLibraryReady, setIsLibraryReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeMarkerType, setActiveMarkerType] = useState('red');
  const [editingSopId, setEditingSopId] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [sopForm, setSopForm] = useState(createEmptyForm());
  const [selectedImageFiles, setSelectedImageFiles] = useState([null, null]);

  useEffect(() => {
    let isMounted = true;

    const loadLibrary = async () => {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select(
          'id, title, steps, warnings, video_url, image_url_1, image_url_2, markers_1, markers_2, created_at'
        )
        .order('created_at', { ascending: false });

      if (error) {
        if (isMounted) {
          console.error('Supabase load error', error);
          alert(`Supabase veri yukleme hatasi: ${error.message}`);
          setIsLibraryReady(true);
        }
        return;
      }

      if (isMounted) {
        setLibrary((data || []).map(normalizeSop));
        setIsLibraryReady(true);
      }
    };

    loadLibrary();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(AUTH_STORAGE_KEY, String(isAuthenticated));
  }, [isAuthenticated]);

  useEffect(() => {
    return () => {
      sopForm.imageSlots.forEach((slot) => {
        if (slot.imageUrl && slot.imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(slot.imageUrl);
        }
      });
    };
  }, [sopForm.imageSlots]);

  const resetForm = () => {
    sopForm.imageSlots.forEach((slot) => {
      if (slot.imageUrl && slot.imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(slot.imageUrl);
      }
    });

    setSopForm(createEmptyForm());
    setEditingSopId(null);
    setActiveImageIndex(0);
    setIsEditorOpen(false);
    setSelectedImageFiles([null, null]);
  };

  const validateForm = () => {
    if (!sopForm.title.trim()) return 'Baslik zorunlu.';
    if (!sopForm.videoUrl.trim()) return 'Video URL zorunlu.';
    if (sopForm.steps.some((step) => !step.trim())) return 'Tum adimlar doldurulmak zorunda.';
    if (sopForm.imageSlots.some((slot) => !slot.imageUrl)) return 'Iki gorsel de zorunlu.';
    return null;
  };

  const uploadSingleImage = async (sopId, slotIndex) => {
    const selectedFile = selectedImageFiles[slotIndex];
    const currentSlot = sopForm.imageSlots[slotIndex];

    if (!selectedFile) {
      return currentSlot.imageUrl || '';
    }

    const fileExt = getFileExtension(selectedFile.name);
    const filePath = `${sopId}/image-${slotIndex + 1}-${Date.now()}.${fileExt}`;
    const existingSop = library.find((item) => item.id === sopId);
    const existingImageUrl = existingSop?.imageSlots?.[slotIndex]?.imageUrl || '';
    const previousStoragePath = extractStoragePath(existingImageUrl);

    console.log('Supabase storage upload starting', {
      supabaseUrl,
      bucket: STORAGE_BUCKET,
      filePath,
      slotIndex,
      fileName: selectedFile.name,
      fileType: selectedFile.type,
      fileSize: selectedFile.size,
    });

    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, selectedFile, {
      cacheControl: '3600',
      contentType: selectedFile.type,
      upsert: false,
    });

    if (uploadError) {
      console.error('Supabase storage upload error', uploadError);
      throw uploadError;
    }

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

    if (previousStoragePath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([previousStoragePath]);
    }

    return data.publicUrl;
  };

  const handleSaveSop = async () => {
    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    const nextId = editingSopId || `sop-${Date.now()}`;
    setIsSaving(true);

    try {
      const uploadedUrls = await Promise.all([uploadSingleImage(nextId, 0), uploadSingleImage(nextId, 1)]);
      const nextSop = {
        ...sopForm,
        id: nextId,
        imageSlots: [
          { ...sopForm.imageSlots[0], imageUrl: uploadedUrls[0] },
          { ...sopForm.imageSlots[1], imageUrl: uploadedUrls[1] },
        ],
      };

      const { error } = await supabase.from(TABLE_NAME).upsert(mapFormToRow(nextSop, nextId));

      if (error) {
        console.error('Supabase database upsert error', error);
        alert(`Supabase kayit hatasi: ${error.message}`);
        setIsSaving(false);
        return;
      }

      setLibrary((prev) => {
        const withoutCurrent = prev.filter((item) => item.id !== nextId);
        return [nextSop, ...withoutCurrent];
      });

      setIsSaving(false);
      resetForm();
    } catch (error) {
      console.error('Supabase save flow error', error);
      setIsSaving(false);

      const message =
        error?.message === 'Failed to fetch'
          ? 'Supabase storage yukleme hatasi: Failed to fetch. URL, bucket, network veya CORS kontrol et.'
          : `Supabase storage yukleme hatasi: ${error?.message || 'Bilinmeyen hata'}`;

      alert(message);
    }
  };

  const handleDeleteSop = async (sopId) => {
    const currentSop = library.find((item) => item.id === sopId);
    const storagePaths = (currentSop?.imageSlots || [])
      .map((slot) => extractStoragePath(slot.imageUrl))
      .filter(Boolean);

    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', sopId);

    if (error) {
      alert(`Supabase silme hatasi: ${error.message}`);
      return;
    }

    if (storagePaths.length > 0) {
      await supabase.storage.from(STORAGE_BUCKET).remove(storagePaths);
    }

    setLibrary((current) => current.filter((item) => item.id !== sopId));

    if (editingSopId === sopId) {
      resetForm();
    }
  };

  const updateStep = (index, value) => {
    const nextSteps = [...sopForm.steps];
    nextSteps[index] = value;
    setSopForm((prev) => ({ ...prev, steps: nextSteps }));
  };

  const updateWarning = (index, value) => {
    const nextWarnings = [...sopForm.warnings];
    nextWarnings[index] = value;
    setSopForm((prev) => ({ ...prev, warnings: nextWarnings }));
  };

  const handleImageSelect = (slotIndex, file) => {
    if (!file) return;

    const nextFiles = [...selectedImageFiles];
    nextFiles[slotIndex] = file;
    setSelectedImageFiles(nextFiles);

    setSopForm((prev) => {
      const nextSlots = [...prev.imageSlots];
      const currentUrl = nextSlots[slotIndex].imageUrl;

      if (currentUrl && currentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }

      nextSlots[slotIndex] = {
        ...nextSlots[slotIndex],
        imageUrl: URL.createObjectURL(file),
        markers: [],
      };

      return { ...prev, imageSlots: nextSlots };
    });
  };

  const handleMarkerAdd = (slotIndex, event) => {
    const rect = imageContainerRefs[slotIndex].current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    setSopForm((prev) => {
      const nextSlots = [...prev.imageSlots];
      const label =
        activeMarkerType === 'red'
          ? (nextSlots[slotIndex].markers.filter((marker) => marker.type === 'red').length + 1).toString()
          : null;

      nextSlots[slotIndex] = {
        ...nextSlots[slotIndex],
        markers: [...nextSlots[slotIndex].markers, { x, y, type: activeMarkerType, label }],
      };

      return { ...prev, imageSlots: nextSlots };
    });
  };

  const downloadJPG = async () => {
    const canvas = await html2canvas(downloadRef.current);
    const link = document.createElement('a');
    link.download = `${sopForm.title || 'sop'}.jpg`;
    link.href = canvas.toDataURL('image/jpeg');
    link.click();
  };

  const renderLibraryList = () => (
    <div className="space-y-3 pb-20">
      {library.map((sop) => (
        <div key={sop.id} className="bg-white p-4 rounded-3xl border flex items-center gap-4 group hover:shadow-md transition-all">
          {sop.imageSlots[0].imageUrl && (
            <img src={sop.imageSlots[0].imageUrl} className="w-12 h-12 object-cover rounded-xl border" alt={sop.title} />
          )}
          <div className="flex-1 min-w-0">
            <h4 className="font-black text-slate-800 text-[10px] truncate uppercase">{sop.title}</h4>
            <div className="flex gap-2 mt-1 flex-wrap">
              <p className="text-[9px] text-slate-400 font-bold">{sop.steps.length} Adim</p>
              <p className="text-[9px] text-slate-400 font-bold">2 Gorsel</p>
              {sop.videoUrl && (
                <span className="text-[9px] font-bold text-indigo-500 flex items-center gap-1">
                  <Video size={10} />
                  Video
                </span>
              )}
              {sop.warnings.some((warning) => warning !== '') && (
                <span className="text-[9px] font-bold text-red-500">
                  {sop.warnings.filter((warning) => warning !== '').length} Uyari
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 p-2 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center gap-2">
            <button
              onClick={() => {
                window.location.href = buildOperatorUrl(sop.id);
              }}
              className="rounded-xl overflow-hidden border border-slate-200 hover:border-slate-900 transition-all"
              title="Detay ekranini ac"
            >
              <QRCodeSVG value={buildOperatorUrl(sop.id)} size={52} bgColor="#f8fafc" fgColor="#0f172a" />
            </button>
            <button
              onClick={() => window.open(buildOperatorUrl(sop.id), '_blank', 'noopener,noreferrer')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[9px] font-black text-slate-600 hover:bg-slate-900 hover:text-white transition-all"
            >
              <ExternalLink size={10} />
              AC
            </button>
          </div>
          {isAuthenticated && (
            <div className="flex gap-1">
              <button
                onClick={() => {
                  resetForm();
                  setEditingSopId(sop.id);
                  setIsEditorOpen(true);
                  setSopForm({
                    ...sop,
                    imageSlots: sop.imageSlots.map((slot) => ({
                      imageUrl: slot.imageUrl,
                      markers: [...slot.markers],
                    })),
                    steps: [...sop.steps],
                    warnings: [...sop.warnings],
                  });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="p-2.5 bg-slate-50 text-slate-400 hover:bg-orange-500 hover:text-white rounded-xl transition-all"
              >
                <Edit size={12} />
              </button>
              <button
                onClick={() => handleDeleteSop(sop.id)}
                className="p-2.5 bg-slate-50 text-slate-400 hover:bg-red-600 hover:text-white rounded-xl transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  if (!isLibraryReady) {
    return <div className="p-20 text-center font-black text-slate-400 uppercase tracking-widest">YUKLENIYOR...</div>;
  }

  if (viewMode === 'operator' && targetId) {
    const activeSop = library.find((item) => item.id === targetId);
    const visibleImageSlots = activeSop?.imageSlots?.filter((slot) => slot.imageUrl) || [];

    if (!activeSop) {
      return <div className="p-20 text-center font-black text-slate-400 uppercase tracking-widest">SOP BULUNAMADI!</div>;
    }

    return (
      <div className="min-h-screen bg-white p-4 lg:p-10 animate-in fade-in duration-500">
        <header className="flex items-center gap-4 mb-6 border-b-2 border-slate-50 pb-6">
          <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg">
            <Layers size={24} />
          </div>
          <h1 className="font-black text-2xl text-slate-800 uppercase tracking-tight">{activeSop.title}</h1>
        </header>

        {activeSop.warnings.some((warning) => warning.trim() !== '') && (
          <div className="mb-8 p-6 bg-red-50 border-l-8 border-red-500 rounded-[2rem] shadow-sm animate-pulse">
            <div className="flex items-center gap-3 mb-3 text-red-600">
              <AlertTriangle size={24} />
              <h3 className="font-black uppercase tracking-widest text-sm">KRITIK GUVENLIK UYARILARI</h3>
            </div>
            <ul className="space-y-2">
              {activeSop.warnings.map(
                (warning, idx) =>
                  warning.trim() !== '' && (
                    <li key={idx} className="font-bold text-red-700 flex items-start gap-2 text-lg">
                      <span className="mt-2 w-2 h-2 bg-red-400 rounded-full shrink-0"></span>
                      {warning}
                    </li>
                  )
              )}
            </ul>
          </div>
        )}

        <div className={`grid gap-6 ${visibleImageSlots.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} max-w-5xl mx-auto`}>
          {visibleImageSlots.map((slot, slotIndex) => (
            <div key={slotIndex} className="rounded-[2rem] border-4 border-slate-50 shadow-xl bg-white p-3">
              <div className="relative w-full overflow-hidden rounded-[1.5rem]">
                <img src={slot.imageUrl} className="w-full h-auto block" alt={`Manual ${slotIndex + 1}`} />
                {slot.markers.map((marker, idx) => (
                  <div
                    key={idx}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-2 border-white shadow-2xl flex items-center justify-center text-white font-black text-sm ${
                      marker.type === 'red' ? 'bg-red-500' : 'bg-blue-500'
                    }`}
                    style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                  >
                    {marker.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {visibleImageSlots.length === 0 && (
          <div className="mt-8 p-6 bg-amber-50 border border-amber-200 rounded-[2rem] text-amber-700 font-bold">
            Bu kayit icin gorsel bulunamadi.
          </div>
        )}

        <div className="space-y-4 mt-10">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-4">UYGULAMA ADIMLARI</h3>
          {activeSop.steps.map((step, i) => (
            <div
              key={i}
              className="flex items-start gap-5 p-6 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm transition-all hover:bg-slate-100"
            >
              <span className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black shrink-0 text-lg shadow-md">
                {i + 1}
              </span>
              <p className="font-bold text-slate-700 text-lg pt-1 leading-snug">{step}</p>
            </div>
          ))}
          {activeSop.videoUrl && (
            <a
              href={activeSop.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-3 w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-xl hover:bg-indigo-700 transition-all mt-6 shadow-indigo-100"
            >
              <PlayCircle size={28} />
              VIDEOYU IZLE
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <header className="bg-white border-b p-4 sticky top-0 z-50 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2.5 rounded-2xl text-white shadow-lg shadow-blue-100">
            <Layers size={22} />
          </div>
          <h1 className="font-black text-xl leading-none">
            VisionGuide <span className="text-blue-600 italic tracking-tighter">AR-SOP</span>
          </h1>
        </div>
        {isAuthenticated && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                resetForm();
                setIsEditorOpen(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs hover:bg-blue-700"
            >
              EKLE
            </button>
            <button
              onClick={() => setIsAuthenticated(false)}
              className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-black text-xs hover:bg-red-600"
            >
              CIKIS
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 lg:p-8">
        {!isAuthenticated ? (
          <div className="space-y-8">
            <div className="max-w-md mx-auto mt-8 p-10 bg-white border border-slate-200 rounded-[3rem] shadow-2xl text-center space-y-8 animate-in zoom-in-95 duration-300">
              <Lock size={40} className="mx-auto text-blue-600" />
              <h2 className="text-3xl font-black tracking-tight">ERISIM PANELI</h2>
              <div className="space-y-4">
                <input
                  type="password"
                  placeholder="****"
                  className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[2rem] text-center text-2xl font-black tracking-[0.5em] outline-none"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                />
                <button
                  onClick={() => {
                    if (accessKey === engineerPassword) setIsAuthenticated(true);
                  }}
                  className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-blue-600 transition-all"
                >
                  GIRIS
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {isEditorOpen && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex justify-between items-center px-4">
                    <div className="flex gap-2 bg-slate-200/50 p-1 rounded-xl">
                      <button
                        onClick={() => setActiveMarkerType('red')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${
                          activeMarkerType === 'red' ? 'bg-red-500 text-white shadow-md' : 'text-slate-400'
                        }`}
                      >
                        RED (STEP)
                      </button>
                      <button
                        onClick={() => setActiveMarkerType('blue')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${
                          activeMarkerType === 'blue' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-400'
                        }`}
                      >
                        BLUE (INFO)
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveImageIndex(0)}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${
                          activeImageIndex === 0 ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border'
                        }`}
                      >
                        GORSEL 1
                      </button>
                      <button
                        onClick={() => setActiveImageIndex(1)}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${
                          activeImageIndex === 1 ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border'
                        }`}
                      >
                        GORSEL 2
                      </button>
                      {(sopForm.imageSlots[0].imageUrl || sopForm.imageSlots[1].imageUrl) && (
                        <button
                          onClick={downloadJPG}
                          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black hover:bg-black transition-all"
                        >
                          <Download size={14} />
                          JPG INDIR
                        </button>
                      )}
                      <button
                        onClick={resetForm}
                        className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-200"
                      >
                        KAPAT
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" ref={downloadRef}>
                    {sopForm.imageSlots.map((slot, slotIndex) => (
                      <div
                        key={slotIndex}
                        className={`bg-white p-4 rounded-[2.5rem] border shadow-sm ${
                          activeImageIndex === slotIndex ? 'ring-2 ring-blue-500' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between px-2 mb-3">
                          <h3 className="font-black text-sm uppercase text-slate-700">Gorsel {slotIndex + 1}</h3>
                          <button
                            onClick={() => setActiveImageIndex(slotIndex)}
                            className="text-[10px] font-black text-blue-600"
                          >
                            Isaretleme Alani
                          </button>
                        </div>

                        <div className="relative overflow-hidden rounded-2xl border-2 border-slate-100 bg-slate-50 min-h-[320px] flex items-center justify-center cursor-crosshair">
                          {slot.imageUrl ? (
                            <div
                              className="relative w-full h-full"
                              ref={imageContainerRefs[slotIndex]}
                              onClick={(event) => handleMarkerAdd(slotIndex, event)}
                            >
                              <img src={slot.imageUrl} className="w-full h-auto block select-none" alt={`SOP ${slotIndex + 1}`} />
                              {slot.markers.map((marker, idx) => (
                                <div
                                  key={idx}
                                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white font-black text-xs ${
                                    marker.type === 'red' ? 'bg-red-500' : 'bg-blue-500'
                                  }`}
                                  style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                                >
                                  {marker.label}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <button
                              onClick={() => fileInputRefs[slotIndex].current.click()}
                              className="flex flex-col items-center gap-2 text-slate-400 hover:text-blue-500 transition-all"
                            >
                              <ImageIcon size={48} />
                              <span className="font-bold">Gorsel {slotIndex + 1} Yukle</span>
                            </button>
                          )}
                        </div>

                        <input
                          type="file"
                          ref={fileInputRefs[slotIndex]}
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => handleImageSelect(slotIndex, e.target.files[0])}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-white rounded-[2.5rem] p-8 border shadow-sm space-y-4">
                <input
                  type="text"
                  placeholder="SOP Basligi"
                  className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-sm outline-none"
                  value={sopForm.title}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSopForm((prev) => ({ ...prev, title: value }));
                  }}
                />
                <input
                  type="text"
                  placeholder="Video URL (zorunlu)"
                  className="w-full p-4 bg-slate-50 border rounded-2xl text-[10px] font-bold outline-none focus:ring-2 ring-indigo-100"
                  value={sopForm.videoUrl}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSopForm((prev) => ({ ...prev, videoUrl: value }));
                  }}
                />

                <div className="space-y-2 p-4 bg-orange-50 rounded-2xl border border-orange-100">
                  <label className="text-[10px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Guvenlik Uyarilari
                  </label>
                  {sopForm.warnings.map((warning, i) => (
                    <input
                      key={i}
                      className="w-full p-2 bg-white border border-orange-200 rounded-xl text-xs outline-none mb-1"
                      placeholder="Opsiyonel uyari yazin..."
                      value={warning}
                      onChange={(e) => updateWarning(i, e.target.value)}
                    />
                  ))}
                  <button
                    onClick={() => setSopForm((prev) => ({ ...prev, warnings: [...prev.warnings, ''] }))}
                    className="text-[9px] font-black text-orange-500 uppercase"
                  >
                    + UYARI EKLE
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Talimat Adimlari</label>
                  <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {sopForm.steps.map((step, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="w-8 h-8 flex items-center justify-center font-black text-white bg-red-500 rounded-lg text-[10px] shrink-0">
                          {i + 1}
                        </span>
                        <input
                          className="flex-1 p-2.5 border border-slate-200 rounded-xl text-xs outline-none"
                          value={step}
                          onChange={(e) => updateStep(i, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setSopForm((prev) => ({ ...prev, steps: [...prev.steps, ''] }))}
                    className="w-full py-2 border-2 border-dashed rounded-xl text-[10px] font-black text-slate-400"
                  >
                    + ADIM EKLE
                  </button>
                </div>

                <button
                  onClick={handleSaveSop}
                  disabled={isSaving}
                  className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black text-sm shadow-xl active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'KAYDEDILIYOR...' : 'SISTEME KAYDET'}
                </button>
              </div>
                </div>
              </div>
            )}

            {!isEditorOpen && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-lg uppercase tracking-tight">Kayitli SOP Listesi</h3>
                  <p className="text-xs font-bold text-slate-400">{library.length} kayit</p>
                </div>
                {renderLibraryList()}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
