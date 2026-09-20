// ============================================================
// SPOTTER — Carrossel de publicações pagas (Ideia 1)
// ------------------------------------------------------------
// Usado na Home. Não bloqueia o resto da página se falhar ou vier
// vazio — devolve null e a Home continua normal.
// ============================================================
import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { fetchActivePosts, type BusinessPost } from "@/lib/posts-events-db";

export function SponsoredPostsFeed({ city }: { city?: string }) {
  const [posts, setPosts] = useState<BusinessPost[]>([]);

  useEffect(() => {
    fetchActivePosts(city).then(setPosts);
  }, [city]);

  if (posts.length === 0) return null;

  return (
    <div className="py-2">
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
        {posts.map((post) => (
          <Link
            key={post.id}
            to="/place/$id"
            params={{ id: post.businessId }}
            className="press relative h-40 w-32 flex-shrink-0 overflow-hidden rounded-2xl block"
          >
            <img
              src={post.photoUrl}
              alt={post.caption ?? post.businessName}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <p className="truncate text-[11px] font-semibold text-white">{post.businessName}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
