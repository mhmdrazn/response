"use client";

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface SelectMenuProps {
  options: SelectOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
}

interface MenuPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

const MENU_MAX_HEIGHT = 260;

/**
 * Listbox dropdown. A native <select> cannot style its option list, and the
 * panel it sits in scrolls and clips, so the list is portalled to <body> and
 * positioned against the trigger instead.
 */
export function SelectMenu({ options, value, onChange, ariaLabel, placeholder }: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const wanted = Math.min(MENU_MAX_HEIGHT, options.length * 42 + 8);
    if (below < wanted + 12 && r.top > below) {
      setPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 });
    } else {
      setPos({ left: r.left, width: r.width, top: r.bottom + 4 });
    }
  }, [options.length]);

  const openMenu = useCallback(() => {
    place();
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [place, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function choose(index: number) {
    const opt = options[index];
    if (opt) onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`font-manrope flex w-full cursor-pointer items-center gap-8 rounded-md border bg-pure-white px-[10px] py-[8px] text-left text-[12px] tracking-[-0.1px] text-midnight-ink outline-none transition-colors hover:bg-mist focus-visible:border-midnight-ink ${
          open ? "border-midnight-ink bg-mist" : "border-frost"
        }`}
      >
        <span className="min-w-0 flex-1 truncate font-bold">
          {selected ? selected.label : (placeholder ?? "Pilih")}
        </span>
        {selected?.hint ? (
          <span className="flex-shrink-0 text-[11px] font-medium text-slate">{selected.hint}</span>
        ) : null}
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`flex-shrink-0 text-slate transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && pos
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              style={{
                left: pos.left,
                width: pos.width,
                top: pos.top,
                bottom: pos.bottom,
                maxHeight: MENU_MAX_HEIGHT,
              }}
              className="scrollbar-hidden fixed z-[2000] m-0 flex list-none flex-col gap-[2px] overflow-y-auto rounded-md border border-frost bg-pure-white p-[4px]"
            >
              {options.map((o, i) => {
                const isSelected = i === selectedIndex;
                return (
                  <li
                    key={o.value}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(i)}
                    className={`font-manrope flex cursor-pointer items-center gap-8 rounded-[6px] px-[10px] py-[8px] text-[12px] tracking-[-0.1px] transition-colors ${
                      isSelected
                        ? "bg-periwinkle-wash font-bold text-midnight-ink"
                        : i === active
                          ? "bg-mist font-medium text-midnight-ink"
                          : "font-medium text-steel"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint ? (
                      <span className="flex-shrink-0 text-[11px] font-medium text-slate">
                        {o.hint}
                      </span>
                    ) : null}
                    <span className="flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center">
                      {isSelected ? (
                        <Check size={14} strokeWidth={2.5} className="text-midnight-ink" />
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
