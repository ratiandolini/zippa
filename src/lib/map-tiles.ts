// რუკის tile-პროვაიდერი.
// Geoapify — თუ NEXT_PUBLIC_GEOAPIFY_KEY დაყენებულია; თორემ fallback
// OpenStreetMap-ის საჯარო tiles-ზე (key არ სჭირდება, UI არ ტყდება).
const KEY = process.env.NEXT_PUBLIC_GEOAPIFY_KEY;

export const tileConfig = KEY
  ? {
      url: `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${KEY}`,
      attribution:
        'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> | &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 20,
    }
  : {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    };

/** true — თუ Geoapify-ს key კონფიგურირებულია. */
export const usingGeoapify = Boolean(KEY);
