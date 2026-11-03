import { useState, useEffect } from 'react';
import { fetchArticles } from '../Api/api';   // adjust path if needed

const parseJsonField = (field) => {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  try {
    return JSON.parse(field);
  } catch {
    return [];
  }
};

export const useArticles = () => {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadArticles = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetchArticles();
        let articlesArray = [];

        if (Array.isArray(response)) articlesArray = response;
        else if (response?.success && Array.isArray(response?.articles)) articlesArray = response.articles;
        else if (response?.articles) articlesArray = response.articles;

        setBlogs(articlesArray);
      } catch (err) {
        console.error("Failed to load articles:", err);
        setError(err.message || 'Failed to load articles.');
      } finally {
        setLoading(false);
      }
    };

    loadArticles();
  }, []);

  return { blogs, loading, error, parseJsonField };
};