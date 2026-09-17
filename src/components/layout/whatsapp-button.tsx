import { siteConfig } from "@/lib/site";

export function WhatsAppButton() {
  const message = encodeURIComponent(
    "Hi Amodha, I'd like to know more about your dairy products and sweets."
  );

  return (
    <a
      href={`https://wa.me/${siteConfig.contact.whatsapp}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.09c-.24.68-1.4 1.32-1.94 1.36-.5.05-1.06.07-1.72-.11-.4-.11-.9-.28-1.56-.55-2.75-1.19-4.55-3.95-4.69-4.14-.14-.19-1.12-1.49-1.12-2.84 0-1.35.71-2.01.96-2.29.24-.28.53-.34.71-.34s.36 0 .52.01c.17.01.39-.06.61.47.24.57.81 1.98.88 2.13.07.14.11.31.02.5-.09.19-.13.31-.26.47-.13.16-.28.36-.4.48-.13.13-.27.28-.12.55.16.28.71 1.17 1.52 1.9 1.05.94 1.93 1.23 2.21 1.37.28.14.44.12.6-.07.16-.19.68-.79.86-1.06.18-.28.36-.23.6-.14.24.09 1.55.73 1.81.87.27.13.44.19.51.31.06.11.06.65-.18 1.32Z" />
      </svg>
    </a>
  );
}
