uint8 MODE_MANAGED = 1
uint8 MODE_AD_HOC = 2

std_msgs/Header header
float32 frequency 	# GHz
string access_point	# AP ID
float32 bit_rate 	# MB/s
string essid		# Network Name
uint8 mode		    # Managed or ad-hoc
uint8 quality
uint8 quality_max
int16 level
int16 noise
bool supports_scanning
uint8 num_peers		 # number of connected phntm peers
