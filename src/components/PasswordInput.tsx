"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordInputProps {
  name: string;
  placeholder?: string;
  className?: string;
  minLength?: number;
  required?: boolean;
}

export default function PasswordInput({
  name,
  placeholder = "••••••••",
  className = "",
  minLength,
  required,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        name={name}
        placeholder={placeholder}
        minLength={minLength}
        required={required}
        className={`w-full rounded-lg px-4 py-3 pr-12 bg-zinc-50 border border-zinc-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition font-medium ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition"
        tabIndex={-1}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
