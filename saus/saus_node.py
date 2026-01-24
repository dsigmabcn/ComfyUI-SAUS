class Saus:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
            },
        }

    RETURN_TYPES = ("Saus",)
    FUNCTION = "saus"
    CATEGORY = 'KN/Saus'
    def saus(self):
        return "Saus"
    
NODE_CLASS_MAPPINGS = {
    "Saus": Saus
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Saus": "Saus"
}