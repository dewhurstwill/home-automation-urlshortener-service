// Node Modules
const express = require('express');
const monk = require('monk');
const { nanoid } = require('nanoid');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');

// MongoDB Connection
const db = monk(process.env.MONGODB_URI);
const urls = db.get('url-shortener');
urls.createIndex({ slug: 1 }, { unique: true });

// Joi Schema
const createSchema = Joi.object({
  // Validate Slug
  // Must be a string, not null, alphanumeric (a-zA-Z0-9)
  slug: Joi.string().trim().alphanum().max(128),
  // Validate Url
  // Must be a string, not null, must be a uri and is required
  url: Joi.string().trim().uri().required().max(512)
});

// Express Router
const router = express.Router();

// Create Limiter
const createApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5
});

// Create short url
router.post('/api/v1/url/shorten', createApiLimiter, async (req, res, next) => {
  try {
    // Validate Request Body
    const validated = await createSchema.validateAsync(req.body);
    // Deconstruct slug from the validated body
    let { slug } = validated;
    // Convert slug to a lowercase string
    slug = slug ? slug.toLowerCase() : '';
    // If not slug
    if (!slug) {
      slug = nanoid(10); // Generate an ID to use as a slug
    } else {
      // Check if the user provided slug exists in the database
      const slugExists = await urls.findOne({ slug });
      // If slug exists, throw an error
      if (slugExists) {
        return res.json({
          message: 'Slug in use'
        });
      }
    }
    // Insert url into the database with the slug
    const created = await urls.insert({
      url: validated.url,
      slug
    });
    // If record creation successful, return http200
    if (created) {
      return res.json({
        message: 'Success',
        ...created
      });
    }
  } catch (error) {
    // Handle error
    return next(error);
  }
});

// Retrieve short url
router.get('/:id', async (req, res) => {
  // Deconstruct the ID from the url params,
  // save it as a variable called slug
  const { id: slug } = req.params;
  try {
    // Find the slug in the database
    const url = await urls.findOne({ slug });
    // If record exists, redirect to the saved url
    if (url) return res.status(301).redirect(url.url);
    // If record not found, redirect to the error page
    return res.status(301).redirect(`/?error=${slug} not found`);
  } catch (error) {
    // Handle error
    return res.status(301).redirect('/?error=Link not found');
  }
});

module.exports = router;
