def is_volume_spike(current_volume: int, average_volume: int, threshold: float = 2.0) -> bool:
    """
    Determine if the current trading volume is a spike compared to the average volume.

    Args:
        current_volume (int): The current trading volume.
        average_volume (int): The average trading volume over a specified period.
        threshold (float): The multiplier threshold to consider it a spike (default is 2.0).

    Returns:
        bool: True if it's a volume spike, False otherwise.
    """
    if average_volume == 0:
        return False  # Avoid division by zero
    return current_volume >= average_volume * threshold
    