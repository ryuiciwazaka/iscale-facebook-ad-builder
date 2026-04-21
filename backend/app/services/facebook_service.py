import os
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.adimage import AdImage
from facebook_business.adobjects.adcreative import AdCreative
from facebook_business.adobjects.ad import Ad
from facebook_business.adobjects.advideo import AdVideo
from dotenv import load_dotenv
from pathlib import Path
from facebook_business.adobjects.user import User
import time

# Load .env from project root (parent of backend)
env_path = Path(__file__).resolve().parent.parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

class FacebookService:
    def __init__(self):
        # Try standard names first, then VITE_ prefixed names (common in this project)
        self.access_token = os.getenv("FACEBOOK_ACCESS_TOKEN") or os.getenv("VITE_FACEBOOK_ACCESS_TOKEN")
        self.ad_account_id = os.getenv("FACEBOOK_AD_ACCOUNT_ID") or os.getenv("VITE_FACEBOOK_AD_ACCOUNT_ID")
        self.app_id = os.getenv("FACEBOOK_APP_ID") or os.getenv("VITE_FACEBOOK_APP_ID")
        self.app_secret = os.getenv("FACEBOOK_APP_SECRET") or os.getenv("VITE_FACEBOOK_APP_SECRET")
        self.api = None
        self.account = None
        
        if self.access_token and self.ad_account_id:
            self.initialize()

    def initialize(self):
        """Initialize the Facebook API connection."""
        try:
            FacebookAdsApi.init(
                app_id=self.app_id,
                app_secret=self.app_secret,
                access_token=self.access_token
            )
            self.api = FacebookAdsApi.get_default_api()
            
            # Only set up the AdAccount object if we have an ID
            if self.ad_account_id:
                # Ensure ad account ID has 'act_' prefix
                account_id = self.ad_account_id
                if not account_id.startswith('act_'):
                    account_id = f'act_{account_id}'
                self.account = AdAccount(account_id)
            
            return True
        except Exception as e:
            # Re-raise the exception so the caller knows what went wrong
            raise Exception(f"Facebook API Init Error: {str(e)}")


    def get_ad_accounts(self):
        """Fetch all ad accounts for the current user."""
        if not self.api:
            # Try to initialize if not already done
            self.initialize()
        
        # Use the SDK's User object to fetch ad accounts
        print("Fetching ad accounts for user 'me'...")
        try:
            me = User(fbid='me', api=self.api)
            my_accounts = me.get_ad_accounts(fields=['id', 'name', 'account_id', 'account_status', 'currency', 'balance', 'amount_spent'])
            print(f"Found {len(my_accounts)} accounts.")
            return [dict(acc) for acc in my_accounts]
        except Exception as e:
            print(f"Error fetching ad accounts: {e}")
            raise e

    def _get_account(self, ad_account_id=None):
        """Helper to get AdAccount object."""
        if ad_account_id:
            if not ad_account_id.startswith('act_'):
                ad_account_id = f'act_{ad_account_id}'
            return AdAccount(ad_account_id, api=self.api)
        
        if self.account:
            return self.account
            
        raise Exception("No Ad Account ID provided and no default account set.")

    def get_insights(self, ad_account_id=None, level='campaign', date_preset='last_30d',
                     time_range=None, breakdown=None):
        """Fetch performance insights for an ad account.

        Args:
            ad_account_id: act_xxx account id (optional; defaults to env)
            level: 'account' | 'campaign' | 'adset' | 'ad'
            date_preset: today, yesterday, last_7d, last_14d, last_30d, last_90d, maximum
            time_range: {'since':'YYYY-MM-DD','until':'YYYY-MM-DD'} — overrides date_preset
            breakdown: optional FB breakdown (e.g. 'age', 'gender', 'country')
        """
        account = self._get_account(ad_account_id)

        fields = [
            'account_id', 'account_name',
            'campaign_id', 'campaign_name',
            'adset_id', 'adset_name',
            'ad_id', 'ad_name',
            'spend', 'impressions', 'reach', 'frequency',
            'clicks', 'unique_clicks', 'ctr', 'unique_ctr',
            'cpc', 'cpm', 'cpp',
            'actions', 'action_values',
            'purchase_roas', 'website_purchase_roas',
            'cost_per_action_type', 'cost_per_unique_click',
            'video_p25_watched_actions', 'video_p50_watched_actions',
            'video_p75_watched_actions', 'video_p100_watched_actions',
            'date_start', 'date_stop',
        ]

        params = {'level': level}
        if time_range:
            params['time_range'] = time_range
        else:
            params['date_preset'] = date_preset
        if breakdown:
            params['breakdowns'] = breakdown

        try:
            insights = account.get_insights(fields=fields, params=params)
            results = []
            for row in insights:
                d = dict(row)
                # Convert nested list-of-dict Facebook structures to plain JSON-safe
                for key in ('actions', 'action_values', 'cost_per_action_type',
                            'purchase_roas', 'website_purchase_roas',
                            'video_p25_watched_actions', 'video_p50_watched_actions',
                            'video_p75_watched_actions', 'video_p100_watched_actions'):
                    if key in d and d[key] is not None:
                        d[key] = [dict(x) for x in d[key]]
                results.append(d)
            return results
        except Exception as e:
            print(f"Error fetching insights: {e}")
            raise

    def get_ad_creative(self, ad_id):
        """Fetch an ad's creative (body, title, image_url, video_id, CTA).

        Returns a dict with keys: body, title, image_url, video_id, cta_type, link_url.
        All optional — missing values are None.
        """
        if not self.api:
            self.initialize()
        try:
            ad = Ad(ad_id, api=self.api)
            ad_obj = ad.api_get(fields=[
                'creative{body,title,image_url,video_id,thumbnail_url,'
                'call_to_action_type,object_story_spec,effective_object_story_id,'
                'link_url,asset_feed_spec}'
            ])
            creative = ad_obj.get('creative') or {}
            # Dig into object_story_spec for link_data / video_data if top-level is empty
            oss = creative.get('object_story_spec') or {}
            link_data = oss.get('link_data') or {}
            video_data = oss.get('video_data') or {}
            body = creative.get('body') or link_data.get('message') or video_data.get('message')
            title = creative.get('title') or link_data.get('name') or video_data.get('title')
            image_url = creative.get('image_url') or link_data.get('picture') or creative.get('thumbnail_url')
            video_id = creative.get('video_id') or video_data.get('video_id')
            cta = (creative.get('call_to_action_type')
                   or (link_data.get('call_to_action') or {}).get('type')
                   or (video_data.get('call_to_action') or {}).get('type'))
            link_url = creative.get('link_url') or link_data.get('link')
            return {
                'body': body,
                'title': title,
                'image_url': image_url,
                'video_id': video_id,
                'cta_type': cta,
                'link_url': link_url,
            }
        except Exception as e:
            print(f"Error fetching creative for ad {ad_id}: {e}")
            return {'body': None, 'title': None, 'image_url': None,
                    'video_id': None, 'cta_type': None, 'link_url': None}

    def get_ad_level_insights(self, ad_account_id=None, date_preset='last_30d',
                              breakdowns=None, min_spend=0.0):
        """Ad-level insights with optional breakdowns and min spend filter.

        breakdowns: list like ['age','gender'] or ['publisher_platform','platform_position']
        min_spend: drop rows below this spend.
        """
        breakdown_param = ','.join(breakdowns) if breakdowns else None
        rows = self.get_insights(
            ad_account_id=ad_account_id,
            level='ad',
            date_preset=date_preset,
            breakdown=breakdown_param,
        )
        if min_spend and min_spend > 0:
            rows = [r for r in rows if float(r.get('spend', 0) or 0) >= float(min_spend)]
        return rows

    def get_ad_timeseries(self, ad_id, last_days=14):
        """Daily insights (CTR/freq/CPM/ROAS components) for a single ad over last_days."""
        if not self.api:
            self.initialize()
        preset_map = {7: 'last_7d', 14: 'last_14d', 30: 'last_30d', 90: 'last_90d'}
        date_preset = preset_map.get(last_days, 'last_14d')
        try:
            ad = Ad(ad_id, api=self.api)
            insights = ad.get_insights(
                fields=[
                    'spend', 'impressions', 'reach', 'frequency',
                    'clicks', 'ctr', 'cpm', 'cpc',
                    'actions', 'action_values',
                    'date_start', 'date_stop',
                ],
                params={'time_increment': 1, 'date_preset': date_preset},
            )
            out = []
            for row in insights:
                d = dict(row)
                for key in ('actions', 'action_values'):
                    if key in d and d[key] is not None:
                        d[key] = [dict(x) for x in d[key]]
                out.append(d)
            return out
        except Exception as e:
            print(f"Error fetching timeseries for ad {ad_id}: {e}")
            return []

    def get_campaigns(self, ad_account_id=None):
        """Fetch all campaigns from the ad account."""
        account = self._get_account(ad_account_id)
            
        fields = [
            Campaign.Field.id,
            Campaign.Field.name,
            Campaign.Field.objective,
            Campaign.Field.status,
            Campaign.Field.daily_budget,
            Campaign.Field.lifetime_budget,
            Campaign.Field.budget_remaining,
            Campaign.Field.bid_strategy,
            'is_adset_budget_sharing_enabled',
        ]

        
        return account.get_campaigns(fields=fields)

    def create_campaign(self, campaign_data, ad_account_id=None):
        """Create a new campaign."""
        account = self._get_account(ad_account_id)

        params = {
            Campaign.Field.name: campaign_data.get('name'),
            Campaign.Field.objective: campaign_data.get('objective'),
            Campaign.Field.status: campaign_data.get('status', 'PAUSED'),
            Campaign.Field.special_ad_categories: [],
        }

        # Handle budget based on budget type
        budget_type = campaign_data.get('budget_type') or campaign_data.get('budgetType')
        daily_budget = campaign_data.get('daily_budget') or campaign_data.get('dailyBudget')
        
        if budget_type == 'CBO' and daily_budget:
            # Campaign Budget Optimization
            # Set budget at campaign level, do NOT set is_adset_budget_sharing_enabled
            params[Campaign.Field.daily_budget] = int(float(daily_budget) * 100)
        else:
            # Ad Set Budget Optimization (ABO)
            # Budget is set at ad set level, not campaign level
            # Starting with API v24.0+, is_adset_budget_sharing_enabled is REQUIRED for ABO
            # Set to False to enforce strict ad set budgets
            params['is_adset_budget_sharing_enabled'] = False

            
        bid_strategy = campaign_data.get('bid_strategy') or campaign_data.get('bidStrategy')
        if bid_strategy:
            params[Campaign.Field.bid_strategy] = bid_strategy

        return account.create_campaign(params=params)


    def get_pixels(self, ad_account_id=None):
        """Fetch all pixels for the ad account."""
        from facebook_business.adobjects.adspixel import AdsPixel
        
        account = self._get_account(ad_account_id)
        
        fields = [
            AdsPixel.Field.id,
            AdsPixel.Field.name,
        ]
        
        pixels = account.get_ads_pixels(fields=fields)
        return [dict(pixel) for pixel in pixels]

    def get_pages(self, ad_account_id=None):
        """Fetch all Facebook Pages accessible to the user."""
        from facebook_business.adobjects.page import Page
        from facebook_business.adobjects.user import User
        
        # Fetch pages for the current user (not ad account specific)
        me = User(fbid='me', api=self.api)
        
        fields = [
            Page.Field.id,
            Page.Field.name,
            Page.Field.access_token,
            Page.Field.category,
        ]
        
        pages = me.get_accounts(fields=fields)
        return [dict(page) for page in pages]

    def get_adsets(self, ad_account_id=None, campaign_id=None):
        """Fetch all ad sets."""
        fields = [
            AdSet.Field.id,
            AdSet.Field.name,
            AdSet.Field.status,
            AdSet.Field.daily_budget,
            AdSet.Field.targeting,
            AdSet.Field.optimization_goal,
            AdSet.Field.billing_event,
            AdSet.Field.bid_amount,
            AdSet.Field.promoted_object,
            AdSet.Field.campaign_id,
        ]

        if campaign_id:
            # Fetch from campaign
            campaign = Campaign(campaign_id, api=self.api)
            return campaign.get_ad_sets(fields=fields)
        
        account = self._get_account(ad_account_id)
        return account.get_ad_sets(fields=fields)

    def get_ads(self, adset_id):
        """Fetch all ads for a specific ad set."""
        adset = AdSet(adset_id, api=self.api)
        fields = [
            Ad.Field.id,
            Ad.Field.name,
            Ad.Field.status,
            Ad.Field.creative,
        ]
        return adset.get_ads(fields=fields)

    def create_adset(self, adset_data, ad_account_id=None):
        """Create a new ad set."""
        account = self._get_account(ad_account_id)

        # Transform targeting from camelCase to snake_case
        targeting = adset_data.get('targeting', {})
        transformed_targeting = {}
        
        # Handle age fields
        if 'ageMin' in targeting:
            transformed_targeting['age_min'] = targeting['ageMin']
        if 'ageMax' in targeting:
            transformed_targeting['age_max'] = targeting['ageMax']
        
        # Handle genders
        if 'genders' in targeting:
            transformed_targeting['genders'] = targeting['genders']
        
        # Handle geo_locations - clean up empty arrays
        if 'geo_locations' in targeting:
            geo_locs = targeting['geo_locations']
            cleaned_geo_locs = {}
            
            # Only include non-empty arrays
            for key, value in geo_locs.items():
                if isinstance(value, list) and len(value) > 0:
                    cleaned_geo_locs[key] = value
                elif not isinstance(value, list):
                    # Include non-list values as-is
                    cleaned_geo_locs[key] = value
            
            if cleaned_geo_locs:
                transformed_targeting['geo_locations'] = cleaned_geo_locs
        
        # Handle publisher_platforms
        if 'publisher_platforms' in targeting:
            transformed_targeting['publisher_platforms'] = targeting['publisher_platforms']

        # Fix for Advantage Audience Flag Required error
        # Facebook now requires explicit opt-in/out for Advantage+ Audience
        # Default to 0 (Off) if not provided, unless user explicitly sets it
        advantage_audience = adset_data.get('advantage_audience', 0)
        transformed_targeting['targeting_automation'] = {
            'advantage_audience': advantage_audience
        }

        params = {
            AdSet.Field.name: adset_data.get('name'),
            AdSet.Field.campaign_id: adset_data.get('campaign_id'),
            AdSet.Field.billing_event: 'IMPRESSIONS',
            AdSet.Field.optimization_goal: adset_data.get('optimization_goal') or adset_data.get('optimizationGoal'),
            AdSet.Field.is_dynamic_creative: False,
            AdSet.Field.status: adset_data.get('status', 'PAUSED'),
            AdSet.Field.targeting: transformed_targeting,
        }

        # Handle promoted_object for conversion optimization
        if adset_data.get('optimization_goal') == 'OFFSITE_CONVERSIONS' or adset_data.get('optimizationGoal') == 'OFFSITE_CONVERSIONS':
            pixel_id = adset_data.get('pixelId') or adset_data.get('pixel_id')
            conversion_event = adset_data.get('conversionEvent') or adset_data.get('conversion_event')
            
            if pixel_id and conversion_event:
                params[AdSet.Field.promoted_object] = {
                    'pixel_id': pixel_id,
                    'custom_event_type': conversion_event
                }


        # Handle budget - only set for ABO campaigns (not CBO)
        # CBO = Campaign Budget Optimization (budget at campaign level)
        # ABO = Ad Set Budget Optimization (budget at ad set level)
        budget_type = adset_data.get('budget_type') or adset_data.get('budgetType')

        if budget_type != 'CBO':
            # For ABO campaigns, budget is required at ad set level
            budget = adset_data.get('daily_budget') or adset_data.get('dailyBudget')
            if budget:
                params[AdSet.Field.daily_budget] = int(float(budget) * 100)
        # For CBO campaigns, don't set daily_budget - it's managed at campaign level

        # Handle start time
        if adset_data.get('start_time') or adset_data.get('startTime'):
            start_time = adset_data.get('start_time') or adset_data.get('startTime')
            params[AdSet.Field.start_time] = start_time

        # Handle bid strategy and bid amount
        # For CBO campaigns, bid_strategy is set at campaign level - don't set at ad set level
        # For ABO campaigns, we can set bid_strategy at ad set level
        bid_amount = adset_data.get('bid_amount') or adset_data.get('bidAmount')
        bid_strategy = adset_data.get('bid_strategy') or adset_data.get('bidStrategy')

        if bid_amount:
            params[AdSet.Field.bid_amount] = int(float(bid_amount) * 100)
            if bid_strategy:
                params[AdSet.Field.bid_strategy] = bid_strategy
        elif budget_type != 'CBO':
            # Only set default bid_strategy for ABO campaigns
            # CBO campaigns inherit bid_strategy from campaign level
            params[AdSet.Field.bid_strategy] = 'LOWEST_COST_WITHOUT_CAP'

        return account.create_ad_set(params=params)

    def upload_image(self, image_path_or_url, ad_account_id=None):
        """Upload an image to the ad library."""
        import tempfile
        import requests

        account = self._get_account(ad_account_id)

        # Check if it's a URL or local file path
        if image_path_or_url.startswith('http://') or image_path_or_url.startswith('https://'):
            # Download the image to a temp file
            response = requests.get(image_path_or_url, timeout=30)
            response.raise_for_status()

            # Get file extension from URL or default to .jpg
            ext = '.jpg'
            if '.' in image_path_or_url.split('/')[-1]:
                ext = '.' + image_path_or_url.split('.')[-1].split('?')[0]

            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(response.content)
                local_path = tmp.name

            image = AdImage(parent_id=account.get_id_assured())
            image[AdImage.Field.filename] = local_path
            image.remote_create()

            # Clean up temp file
            try:
                os.remove(local_path)
            except:
                pass

            return image[AdImage.Field.hash]
        else:
            # Local file path
            image = AdImage(parent_id=account.get_id_assured())
            image[AdImage.Field.filename] = image_path_or_url
            image.remote_create()
            return image[AdImage.Field.hash]

    def upload_video(self, video_path_or_url, ad_account_id=None, wait_for_ready=True, timeout=600):
        """Upload a video to the ad library.

        Args:
            video_path_or_url: Local file path or URL to video
            ad_account_id: Optional ad account ID
            wait_for_ready: Whether to wait for video processing to complete
            timeout: Max seconds to wait for processing (default 10 min)

        Returns:
            dict with video_id, status, and thumbnails (if ready)
        """
        import tempfile
        import requests

        account = self._get_account(ad_account_id)

        # Check if it's a URL or local file path
        if video_path_or_url.startswith('http://') or video_path_or_url.startswith('https://'):
            # Download the video to a temp file
            print(f"Downloading video from URL: {video_path_or_url[:100]}...")
            response = requests.get(video_path_or_url, timeout=120, stream=True)
            response.raise_for_status()

            # Get file extension from URL or default to .mp4
            ext = '.mp4'
            if '.' in video_path_or_url.split('/')[-1]:
                url_ext = video_path_or_url.split('.')[-1].split('?')[0].lower()
                if url_ext in ['mp4', 'mov', 'avi', 'webm']:
                    ext = '.' + url_ext

            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                for chunk in response.iter_content(chunk_size=8192):
                    tmp.write(chunk)
                local_path = tmp.name

            print(f"Video downloaded to temp file: {local_path}")
        else:
            local_path = video_path_or_url

        try:
            # Create and upload video
            video = AdVideo(parent_id=account.get_id_assured())
            video[AdVideo.Field.filepath] = local_path
            video.remote_create()

            video_id = video['id']
            print(f"Video uploaded with ID: {video_id}")

            if wait_for_ready:
                # Wait for video processing to complete
                status = self.wait_for_video_ready(video_id, timeout=timeout)
            else:
                status = self.get_video_status(video_id)

            # Get thumbnails if video is ready
            thumbnails = []
            if status.get('status') == 'ready':
                try:
                    thumbnails = self.get_video_thumbnails(video_id)
                except Exception as e:
                    print(f"Warning: Could not fetch thumbnails: {e}")

            return {
                'video_id': video_id,
                'status': status.get('status', 'processing'),
                'thumbnails': thumbnails
            }

        finally:
            # Clean up temp file if we downloaded it
            if video_path_or_url.startswith('http'):
                try:
                    os.remove(local_path)
                except:
                    pass

    def get_video_status(self, video_id):
        """Check the processing status of a video.

        Returns:
            dict with status ('processing', 'ready', 'error')
        """
        import requests

        url = f"https://graph.facebook.com/v21.0/{video_id}"
        params = {
            'fields': 'id,status,length,source',
            'access_token': self.access_token
        }

        response = requests.get(url, params=params, timeout=30)
        data = response.json()

        if 'error' in data:
            return {'status': 'error', 'error': data['error'].get('message', 'Unknown error')}

        # Facebook video status can be: processing, ready, error
        fb_status = data.get('status', {})
        if isinstance(fb_status, dict):
            video_status = fb_status.get('video_status', 'processing').lower()
        else:
            video_status = str(fb_status).lower()

        return {
            'status': video_status,
            'video_id': video_id,
            'length': data.get('length'),
            'source': data.get('source')
        }

    def wait_for_video_ready(self, video_id, timeout=600, interval=10):
        """Wait for video processing to complete.

        Args:
            video_id: Facebook video ID
            timeout: Max seconds to wait
            interval: Seconds between status checks

        Returns:
            dict with final status
        """
        start_time = time.time()

        while (time.time() - start_time) < timeout:
            status = self.get_video_status(video_id)
            print(f"Video {video_id} status: {status.get('status')}")

            if status.get('status') == 'ready':
                return status
            elif status.get('status') == 'error':
                raise Exception(f"Video processing failed: {status.get('error', 'Unknown error')}")

            time.sleep(interval)

        raise Exception(f"Video processing timeout after {timeout} seconds")

    def get_video_thumbnails(self, video_id):
        """Get auto-generated thumbnails for a video.

        Returns:
            list of thumbnail URLs
        """
        import requests

        url = f"https://graph.facebook.com/v21.0/{video_id}/thumbnails"
        params = {
            'access_token': self.access_token
        }

        response = requests.get(url, params=params, timeout=30)
        data = response.json()

        if 'error' in data:
            print(f"Thumbnail fetch error: {data['error']}")
            return []

        thumbnails = []
        for thumb in data.get('data', []):
            if 'uri' in thumb:
                thumbnails.append(thumb['uri'])

        return thumbnails

    def create_creative(self, creative_data, ad_account_id=None):
        """Create an ad creative (supports both image and video)."""
        account = self._get_account(ad_account_id)

        page_id = creative_data.get('page_id')
        image_hash = creative_data.get('image_hash')
        video_id = creative_data.get('video_id')

        # Determine if this is a video or image creative
        if video_id:
            # Video creative
            object_story_spec = {
                'page_id': page_id,
                'video_data': {
                    'video_id': video_id,
                    'message': creative_data.get('primary_text', ''),
                    'title': creative_data.get('headline', ''),
                    'call_to_action': {
                        'type': creative_data.get('cta', 'LEARN_MORE'),
                        'value': {
                            'link': creative_data.get('website_url')
                        }
                    }
                }
            }

            # Add custom thumbnail if provided
            if creative_data.get('thumbnail_url'):
                object_story_spec['video_data']['image_url'] = creative_data['thumbnail_url']
        else:
            # Image creative (existing logic)
            object_story_spec = {
                'page_id': page_id,
                'link_data': {
                    'image_hash': image_hash,
                    'link': creative_data.get('website_url'),
                    'message': creative_data.get('primary_text'),
                    'name': creative_data.get('headline'),
                    'description': creative_data.get('description'),
                    'call_to_action': {
                        'type': creative_data.get('cta', 'LEARN_MORE'),
                        'value': {
                            'link': creative_data.get('website_url')
                        }
                    }
                }
            }

        if creative_data.get('instagram_actor_id'):
            object_story_spec['instagram_actor_id'] = creative_data['instagram_actor_id']

        params = {
            AdCreative.Field.name: creative_data.get('name'),
            AdCreative.Field.object_story_spec: object_story_spec,
        }

        return account.create_ad_creative(params=params)

    def create_ad(self, ad_data, ad_account_id=None):
        """Create an ad."""
        account = self._get_account(ad_account_id)

        params = {
            Ad.Field.name: ad_data.get('name'),
            Ad.Field.adset_id: ad_data.get('adset_id'),
            Ad.Field.creative: {'creative_id': ad_data.get('creative_id')},
            Ad.Field.status: ad_data.get('status', 'ACTIVE'),  # Changed from PAUSED to ACTIVE
        }

        return account.create_ad(params=params)

    # ------------------------------------------------------------------
    # Edit / duplicate operations
    # ------------------------------------------------------------------
    def get_ad_full(self, ad_id):
        """Fetch full ad record incl. adset_id + creative fields."""
        if not self.api:
            self.initialize()
        ad = Ad(ad_id, api=self.api)
        data = ad.api_get(fields=[
            'id', 'name', 'status', 'adset_id', 'campaign_id',
            'creative{id,body,title,image_url,video_id,thumbnail_url,'
            'call_to_action_type,object_story_spec,effective_object_story_id,'
            'image_hash,link_url}',
        ])
        return dict(data)

    def update_ad(self, ad_id, fields):
        """Patch an ad. Accepts {name, status}. Returns updated ad snapshot."""
        if not self.api:
            self.initialize()
        allowed = {}
        if 'name' in fields and fields['name']:
            allowed[Ad.Field.name] = fields['name']
        if 'status' in fields and fields['status']:
            s = str(fields['status']).upper()
            if s in ('ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'):
                allowed[Ad.Field.status] = s
        if not allowed:
            raise ValueError("No updatable fields provided (allowed: name, status)")
        ad = Ad(ad_id, api=self.api)
        ad.api_update(params=allowed)
        return self.get_ad_full(ad_id)

    def update_adset(self, adset_id, fields):
        """Patch an adset. Accepts {name, status, daily_budget, lifetime_budget}.

        Budgets are passed in minor units (kuruş for TRY). Caller handles TL→kuruş.
        """
        if not self.api:
            self.initialize()
        params = {}
        if 'name' in fields and fields['name']:
            params[AdSet.Field.name] = fields['name']
        if 'status' in fields and fields['status']:
            s = str(fields['status']).upper()
            if s in ('ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'):
                params[AdSet.Field.status] = s
        if 'daily_budget' in fields and fields['daily_budget'] is not None:
            params[AdSet.Field.daily_budget] = int(fields['daily_budget'])
        if 'lifetime_budget' in fields and fields['lifetime_budget'] is not None:
            params[AdSet.Field.lifetime_budget] = int(fields['lifetime_budget'])
        if not params:
            raise ValueError("No updatable fields provided")
        adset = AdSet(adset_id, api=self.api)
        adset.api_update(params=params)
        updated = adset.api_get(fields=[
            'id', 'name', 'status', 'daily_budget', 'lifetime_budget', 'campaign_id',
        ])
        return dict(updated)

    def duplicate_ad_with_new_copy(self, source_ad_id, new_copy, ad_account_id=None,
                                   name_suffix='[AB-AI]', status='PAUSED'):
        """Clone a live ad reusing its media (video_id or image_hash) with new copy.

        new_copy: {body, title, cta, link_url?}
        Returns {new_ad, new_creative_id, source_ad_id}. New ad defaults to PAUSED
        so the user can review in Ads Manager before enabling the A/B test.
        """
        if not self.api:
            self.initialize()
        src = self.get_ad_full(source_ad_id)
        creative = src.get('creative') or {}
        oss = creative.get('object_story_spec') or {}
        link_data = oss.get('link_data') or {}
        video_data = oss.get('video_data') or {}

        page_id = oss.get('page_id') or creative.get('page_id')
        instagram_actor_id = oss.get('instagram_actor_id')
        video_id = creative.get('video_id') or video_data.get('video_id')
        image_hash = creative.get('image_hash') or link_data.get('image_hash')
        link = (new_copy.get('link_url') or creative.get('link_url')
                or link_data.get('link') or video_data.get('link'))
        cta = (new_copy.get('cta') or creative.get('call_to_action_type')
               or (link_data.get('call_to_action') or {}).get('type')
               or (video_data.get('call_to_action') or {}).get('type')
               or 'LEARN_MORE')

        if not page_id:
            raise ValueError("Source creative has no page_id — cannot clone")

        creative_data = {
            'name': f"{src.get('name', 'Ad')} — AB creative",
            'page_id': page_id,
            'website_url': link,
            'primary_text': new_copy.get('body'),
            'headline': new_copy.get('title'),
            'cta': cta,
        }
        if video_id:
            creative_data['video_id'] = video_id
            if video_data.get('image_url'):
                creative_data['thumbnail_url'] = video_data['image_url']
        elif image_hash:
            creative_data['image_hash'] = image_hash
        else:
            raise ValueError("Source creative has neither video_id nor image_hash")
        if instagram_actor_id:
            creative_data['instagram_actor_id'] = instagram_actor_id

        new_creative = self.create_creative(creative_data, ad_account_id=ad_account_id)
        new_creative_id = new_creative.get('id') if hasattr(new_creative, 'get') else new_creative['id']

        adset_id = src.get('adset_id')
        if not adset_id:
            raise ValueError("Source ad has no adset_id — cannot place new ad")

        base_name = src.get('name') or 'Ad'
        new_name = f"{base_name} {name_suffix}".strip()
        ad = self.create_ad(
            {
                'name': new_name,
                'adset_id': adset_id,
                'creative_id': new_creative_id,
                'status': status,
            },
            ad_account_id=ad_account_id,
        )
        ad_dict = dict(ad) if hasattr(ad, '__iter__') else {'id': getattr(ad, 'id', None)}
        return {
            'new_ad': ad_dict,
            'new_creative_id': new_creative_id,
            'source_ad_id': source_ad_id,
            'source_name': base_name,
            'new_name': new_name,
        }

    def search_locations(self, query, location_type='city', limit=10, ad_account_id=None):
        """Search for targeting locations."""
        account = self._get_account(ad_account_id)
        
        params = {
            'q': query,
            'type': 'adgeolocation',
            'location_types': [location_type],
            'limit': limit,
        }
        
        return account.get_targeting_search(params=params)

