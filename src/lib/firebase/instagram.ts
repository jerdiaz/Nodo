import { getAdminDb } from './server';

export interface InstagramPost {
  id: string;
  caption: string;
  permalink: string;
  /** URL ya rehospedada en Storage, o la de Instagram si aquello fallo. */
  imageUrl: string;
  isVideo: boolean;
  timestamp: Date;
}

function postsCollection() {
  return getAdminDb().collection('instagram_posts');
}

export async function getInstagramPosts(limit = 6): Promise<InstagramPost[]> {
  const snapshot = await postsCollection().orderBy('timestamp', 'desc').limit(limit).get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      caption: data.caption ?? '',
      permalink: data.permalink ?? '',
      imageUrl: data.imageUrl ?? '',
      isVideo: data.isVideo === true,
      timestamp: data.timestamp?.toDate?.() ?? new Date(0),
    };
  });
}

export async function getStoredPostIds(): Promise<Set<string>> {
  const snapshot = await postsCollection().select().get();
  return new Set(snapshot.docs.map((doc) => doc.id));
}

export async function saveInstagramPost(post: InstagramPost): Promise<void> {
  const { id, ...rest } = post;
  await postsCollection().doc(id).set(rest, { merge: true });
}
