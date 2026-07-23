import RecommendationClient from '@/components/RecommendationClient';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-4 py-12 sm:px-6">
      <RecommendationClient />
    </main>
  );
}
