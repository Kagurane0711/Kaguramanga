import { create } from 'zustand';

export type CatalogBrand = 'manga' | 'manhwa';

interface CatalogBrandStore {
  brand: CatalogBrand;
  setBrand: (brand: CatalogBrand) => void;
}

const STORAGE_KEY = 'polin_catalog_brand';

function readInitialBrand(): CatalogBrand {
  if (typeof window === 'undefined') return 'manga';
  if (window.location.pathname.startsWith('/manhwa')) return 'manhwa';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'manga' || saved === 'manhwa') return saved;
  } catch {
    // ignore storage errors
  }
  return 'manga';
}

const useCatalogBrand = create<CatalogBrandStore>((set) => ({
  brand: readInitialBrand(),
  setBrand: (brand) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, brand);
    } catch {
      // ignore storage errors
    }
    set({ brand });
  },
}));

export default useCatalogBrand;
